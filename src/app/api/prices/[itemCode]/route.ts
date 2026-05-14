import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_BY_CODE } from "@/lib/constants";

// PUT — обновить дефолтную позицию мастера: цена, фото, скрытие.
// Поддерживает multipart (с фото) и JSON (без).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ itemCode: string }> },
) {
  try {
    const master = await requireAuth();
    const { itemCode } = await params;

    if (!PRODUCT_BY_CODE[itemCode]) {
      return NextResponse.json({ error: "Неизвестный код позиции" }, { status: 400 });
    }

    const existing = await prisma.masterPrice.findUnique({
      where: { masterId_itemCode: { masterId: master.id, itemCode } },
    });

    const contentType = request.headers.get("content-type") || "";
    let price: number | undefined;
    let isHidden: boolean | undefined;
    let newPhotoUrl: string | null | undefined;
    let removePhoto = false;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.has("price")) price = parseFloat(String(form.get("price") || "0"));
      if (form.has("isHidden")) isHidden = String(form.get("isHidden")) === "true";
      if (String(form.get("removePhoto")) === "true") removePhoto = true;

      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "Фото максимум 5MB" }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `master-prices/${master.id}/${itemCode}-${Date.now()}.${
          ext === "heic" || ext === "heif" ? "jpg" : ext
        }`;
        const ct =
          file.type === "image/heic" || file.type === "image/heif"
            ? "image/jpeg"
            : file.type || "image/jpeg";
        const blob = await put(path, file, { access: "public", contentType: ct });
        newPhotoUrl = blob.url;
      }
    } else {
      const body = await request.json();
      if (body.price !== undefined) price = Number(body.price);
      if (body.isHidden !== undefined) isHidden = Boolean(body.isHidden);
      if (body.removePhoto === true) removePhoto = true;
    }

    // Если меняется фото — удалить старое из Blob
    if ((newPhotoUrl !== undefined || removePhoto) && existing?.photoUrl) {
      try {
        await del(existing.photoUrl);
      } catch (err) {
        console.warn("Failed to delete old photo from Blob:", err);
      }
    }

    const data: {
      price?: number;
      photoUrl?: string | null;
      isHidden?: boolean;
    } = {};
    if (price !== undefined && !Number.isNaN(price)) data.price = price;
    if (isHidden !== undefined) data.isHidden = isHidden;
    if (newPhotoUrl !== undefined) data.photoUrl = newPhotoUrl;
    else if (removePhoto) data.photoUrl = null;

    const result = await prisma.masterPrice.upsert({
      where: { masterId_itemCode: { masterId: master.id, itemCode } },
      update: data,
      create: {
        masterId: master.id,
        itemCode,
        price: price ?? PRODUCT_BY_CODE[itemCode].defaultPrice,
        photoUrl: newPhotoUrl ?? null,
        isHidden: isHidden ?? false,
      },
    });

    return NextResponse.json({
      itemCode: result.itemCode,
      price: result.price,
      photoUrl: result.photoUrl,
      isHidden: result.isHidden,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update master price error:", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}
