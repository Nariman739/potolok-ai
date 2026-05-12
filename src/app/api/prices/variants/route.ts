import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_CATEGORIES = [
  "canvas",
  "profile",
  "spot",
  "chandelier",
  "curtain",
  "gardina",
  "podshtornik",
  "track",
  "lightline",
] as const;

const ALLOWED_UNITS = ["м²", "м.п.", "шт.", "пара", "₸"] as const;

function isCategory(v: string): boolean {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(v);
}

function isUnit(v: string): boolean {
  return (ALLOWED_UNITS as readonly string[]).includes(v);
}

export async function GET(request: NextRequest) {
  try {
    const master = await requireAuth();
    const category = request.nextUrl.searchParams.get("category");

    const where: { masterId: string; category?: string } = { masterId: master.id };
    if (category && isCategory(category)) where.category = category;

    const variants = await prisma.priceVariant.findMany({
      where,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(variants);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get variants error:", error);
    return NextResponse.json({ error: "Ошибка получения вариантов" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const master = await requireAuth();
    const contentType = request.headers.get("content-type") || "";

    let category: string;
    let name: string;
    let unit: string;
    let price: number;
    let baseCode: string | null = null;
    let photoUrl: string | null = null;
    let sortOrder = 0;

    if (contentType.includes("multipart/form-data")) {
      // С фото — multipart
      const form = await request.formData();
      category = String(form.get("category") || "");
      name = String(form.get("name") || "").trim();
      unit = String(form.get("unit") || "");
      price = parseFloat(String(form.get("price") || "0"));
      baseCode = (form.get("baseCode") as string) || null;
      sortOrder = parseInt(String(form.get("sortOrder") || "0"), 10) || 0;

      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "Фото максимум 5MB" }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `price-variants/${master.id}/${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`;
        const ct = file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type || "image/jpeg";
        const blob = await put(path, file, { access: "public", contentType: ct });
        photoUrl = blob.url;
      }
    } else {
      // Без фото — JSON
      const body = await request.json();
      category = String(body.category || "");
      name = String(body.name || "").trim();
      unit = String(body.unit || "");
      price = parseFloat(String(body.price || 0));
      baseCode = body.baseCode || null;
      sortOrder = body.sortOrder ?? 0;
    }

    if (!isCategory(category)) {
      return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }
    if (!isUnit(unit)) {
      return NextResponse.json({ error: "Неверная единица измерения" }, { status: 400 });
    }
    if (!isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Неверная цена" }, { status: 400 });
    }

    const variant = await prisma.priceVariant.create({
      data: {
        masterId: master.id,
        category,
        baseCode,
        name,
        unit,
        price,
        photoUrl,
        sortOrder,
      },
    });

    return NextResponse.json(variant);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create variant error:", error);
    return NextResponse.json({ error: "Ошибка создания варианта" }, { status: 500 });
  }
}
