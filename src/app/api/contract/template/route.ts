import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { checkTemplate, explainCheck, CONTRACT_PLACEHOLDERS } from "@/lib/contract-template";
import { asLang } from "@/lib/i18n";

/**
 * Свой договор мастера (26.09.2026).
 *
 * GET  — действующая версия и история.
 * POST — сохранить новую версию: прежняя не удаляется, просто перестаёт быть
 *        действующей. Договор это документ, откат к прошлой редакции должен
 *        быть всегда.
 *
 * Шаблон принадлежит компании: у бригады один договор на всех, его правит
 * владелец. Прайс устроен так же.
 */

export async function GET(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const url = new URL(request.url);
    const language = asLang(url.searchParams.get("lang") ?? master.language);
    const kind = url.searchParams.get("kind") === "act" ? "act" : "contract";

    const [active, history] = await Promise.all([
      prisma.masterContract.findFirst({
        where: { masterId: scope.ownerId, kind, language, isActive: true },
        orderBy: { version: "desc" },
      }),
      prisma.masterContract.findMany({
        where: { masterId: scope.ownerId, kind, language },
        orderBy: { version: "desc" },
        take: 20,
        select: { id: true, version: true, note: true, createdAt: true, isActive: true },
      }),
    ]);

    return NextResponse.json({
      // Своего текста ещё нет — мастер работает по типовому из кода.
      template: active,
      history,
      placeholders: CONTRACT_PLACEHOLDERS,
      canEdit: scope.isOwner,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract template read error:", error);
    return NextResponse.json({ error: "Не удалось прочитать договор" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Договор меняет владелец компании" }, { status: 403 });
    }

    const body = (await request.json()) as {
      body?: unknown;
      note?: unknown;
      kind?: unknown;
      language?: unknown;
      force?: unknown;
    };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (text.length < 200) {
      return NextResponse.json({ error: "Текст договора слишком короткий" }, { status: 400 });
    }
    if (text.length > 60_000) {
      return NextResponse.json({ error: "Текст договора слишком длинный" }, { status: 400 });
    }
    const kind = body.kind === "act" ? "act" : "contract";
    const language = asLang(body.language ?? master.language);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null;

    // Метки и обязательные пункты. Мастер может настоять — тогда сохраняем,
    // но предупредив: это его документ и его ответственность.
    const check = checkTemplate(text);
    if (!check.ok && body.force !== true) {
      return NextResponse.json(
        { error: explainCheck(check, language), check, needsConfirm: true },
        { status: 409 },
      );
    }

    const last = await prisma.masterContract.findFirst({
      where: { masterId: scope.ownerId, kind, language },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const saved = await prisma.$transaction(async (tx) => {
      await tx.masterContract.updateMany({
        where: { masterId: scope.ownerId, kind, language, isActive: true },
        data: { isActive: false },
      });
      return tx.masterContract.create({
        data: {
          masterId: scope.ownerId,
          companyId: scope.companyId,
          kind,
          language,
          version: (last?.version ?? 0) + 1,
          body: text,
          note,
          isActive: true,
        },
      });
    });

    return NextResponse.json({ template: saved, check });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract template save error:", error);
    return NextResponse.json({ error: "Не удалось сохранить договор" }, { status: 500 });
  }
}
