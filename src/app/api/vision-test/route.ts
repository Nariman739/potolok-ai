import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runVisionAgents } from "@/lib/vision-agents";

export async function POST(request: Request) {
  try {
    await requireAuth();

    const body = await request.json();
    const { imageBase64Url } = body as { imageBase64Url: string };

    if (!imageBase64Url) {
      return NextResponse.json(
        { error: "Отправьте фото" },
        { status: 400 }
      );
    }

    const result = await runVisionAgents(imageBase64Url);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Vision test error:", error);
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
