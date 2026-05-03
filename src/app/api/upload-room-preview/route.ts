import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";

const MAX_BYTES = 8 * 1024 * 1024;
const PNG_PREFIX = "data:image/png;base64,";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const body = (await request.json()) as { dataUrl?: string };
    const dataUrl = body.dataUrl;

    if (!dataUrl || !dataUrl.startsWith(PNG_PREFIX)) {
      return NextResponse.json({ error: "Ожидается PNG dataURL" }, { status: 400 });
    }

    const base64 = dataUrl.slice(PNG_PREFIX.length);
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: "Неверный размер изображения" }, { status: 400 });
    }

    const timestamp = Date.now();
    const path = `room-previews/${master.id}/${timestamp}.png`;

    const blob = await put(path, buffer, {
      access: "public",
      contentType: "image/png",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Room preview upload error:", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}
