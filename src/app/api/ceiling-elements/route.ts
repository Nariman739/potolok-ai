// GET  /api/ceiling-elements  — список элементов в библиотеке мастера (с фильтром по категории)
// POST /api/ceiling-elements  — добавить элемент (multipart с фото + категория + имя)
//                                Автоматически прогоняется через Claude vision для auto-describe

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { describeCeilingElement } from "@/lib/ai-visualization";
import { checkAiBudget, recordAiUsage, masterRole } from "@/lib/ai-cost-cap";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_CATEGORIES = new Set([
  "spot",
  "track",
  "lightline",
  "chandelier",
  "ventilation",
  "decoration",
  "profile",
  "other",
]);

export async function GET(request: Request) {
  try {
    const master = await requireAuth();
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const includeHidden = url.searchParams.get("includeHidden") === "true";

    const elements = await prisma.ceilingElement.findMany({
      where: {
        masterId: master.id,
        ...(category ? { category } : {}),
        ...(includeHidden ? {} : { isHidden: false }),
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ elements });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[ceiling-elements GET]", error);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const category = formData.get("category") as string | null;
    const name = formData.get("name") as string | null;
    const defaultQty = parseInt((formData.get("defaultQty") as string) || "1", 10);

    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }
    if (!category || !VALID_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: "Категория: spot | track | lightline | chandelier | ventilation | decoration | profile | other" },
        { status: 400 },
      );
    }
    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Укажите имя элемента" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Только изображения" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Максимальный размер 10MB" }, { status: 400 });
    }

    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const contentType =
      file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type;

    const blob = await put(
      `visualization/${master.id}/elements/${Date.now()}.${ext}`,
      file,
      { access: "public", contentType, addRandomSuffix: true },
    );

    // Сразу прогоняем через Claude vision — кэшируем описание чтобы не считать при каждом рендере.
    // Только если есть бюджет; иначе сохраняем без описания (рендер позже сделает на лету).
    let description: string | null = null;
    const budget = await checkAiBudget(master.id, masterRole(master));
    if (budget.allowed) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const { description: desc, costUsd } = await describeCeilingElement(
          buf.toString("base64"),
          contentType,
        );
        description = desc;
        await recordAiUsage(master.id, costUsd);
      } catch (e) {
        console.warn("[ceiling-elements POST] describe failed, saving without description:", e);
      }
    }

    const element = await prisma.ceilingElement.create({
      data: {
        masterId: master.id,
        category,
        name: name.trim(),
        description,
        imageUrl: blob.url,
        defaultQty: Math.max(1, Math.min(99, defaultQty)),
      },
    });

    return NextResponse.json({ element });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[ceiling-elements POST]", error);
    return NextResponse.json({ error: "Не удалось добавить элемент" }, { status: 500 });
  }
}
