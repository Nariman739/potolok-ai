import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { checkAiBudget, recordAiUsage, masterRole, computeCostFromUsage } from "@/lib/ai-cost-cap";
import { checkTemplate, explainCheck, CONTRACT_PLACEHOLDERS } from "@/lib/contract-template";
import { asLang } from "@/lib/i18n";

/**
 * Правка договора словами мастера (26.09.2026).
 *
 * Мастер пишет «предоплата пусть будет 30 процентов» или «добавь пункт, что
 * мусор вывозим сами» — модель возвращает переписанный текст целиком. Мы его
 * НЕ сохраняем: сначала мастер смотрит, что получилось, и сохраняет сам
 * отдельным запросом. Документ не должен меняться в обход человека.
 *
 * Здесь же две проверки: не потерялись ли метки подстановки и не выпал ли
 * обязательный пункт. Модель, переписывая абзац, легко «причёсывает» и то,
 * и другое.
 */

const MAX_BODY = 60_000;

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Договор меняет владелец компании" }, { status: 403 });
    }

    const budget = await checkAiBudget(master.id, masterRole(master));
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "На сегодня лимит AI исчерпан. Попробуйте завтра." },
        { status: 429 },
      );
    }

    const body = (await request.json()) as { body?: unknown; ask?: unknown; language?: unknown };
    const current = typeof body.body === "string" ? body.body : "";
    const ask = typeof body.ask === "string" ? body.ask.trim() : "";
    const language = asLang(body.language ?? master.language);

    if (!current || current.length > MAX_BODY) {
      return NextResponse.json({ error: "Нет текста договора" }, { status: 400 });
    }
    if (ask.length < 3 || ask.length > 1000) {
      return NextResponse.json({ error: "Скажите, что поменять в договоре" }, { status: 400 });
    }

    const tags = CONTRACT_PLACEHOLDERS.map((p) => `{${p.key}} — ${p.about}`).join("\n");
    const system = `Ты правишь ДОГОВОР мастера натяжных потолков в Казахстане. Мастер говорит, что поменять, ты возвращаешь договор целиком с учётом правки.

ЖЁСТКИЕ ПРАВИЛА
1. Верни ТОЛЬКО текст договора. Без пояснений, без «вот ваш договор», без разметки кода.
2. Меняй ровно то, о чём просят. Остальное оставь слово в слово — это юридический документ, а не сочинение.
3. Метки в фигурных скобках сохраняй в точности, они заменяются на данные при печати:
${tags}
4. Нельзя убирать пункты о сторонах, предмете, сумме, порядке оплаты, подписях — без них договор недействителен. Если мастер просит убрать такое, оставь пункт и в конце добавь строку, начинающуюся с «ВНИМАНИЕ:», объяснив почему.
5. Нумерация пунктов остаётся сплошной. Добавил пункт — перенумеруй.
6. Язык договора: ${language === "kk" ? "казахский" : "русский"}. Не переводи на другой язык.
7. Не выдумывай реквизиты, суммы и сроки: для них есть метки.`;

    const completion = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Текущий договор:\n\n${current}\n\n---\nЧто поменять: ${ask}` },
      ],
      max_tokens: 8000,
      temperature: 0.2,
    });

    let text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "Не получилось переписать. Попробуйте сказать иначе." }, { status: 502 });
    }
    // Модель иногда всё же оборачивает ответ в тройные кавычки.
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

    // Предупреждение модели вытаскиваем отдельной строкой, в договоре ему не место.
    let warning: string | null = null;
    const warnAt = text.lastIndexOf("ВНИМАНИЕ:");
    if (warnAt > text.length - 600 && warnAt > 0) {
      warning = text.slice(warnAt + "ВНИМАНИЕ:".length).trim();
      text = text.slice(0, warnAt).trim();
    }

    const check = checkTemplate(text);
    const problem = explainCheck(check, language);

    if (completion.usage) {
      await recordAiUsage(master.id, computeCostFromUsage(completion.usage, AI_MODEL)).catch(() => {});
    }
    // Что просили менять — храним у последней версии, чтобы в истории было
    // видно не только «версия 4», но и зачем она появилась.
    await prisma.masterContract
      .updateMany({
        where: { masterId: scope.ownerId, isActive: true, note: null },
        data: { note: ask.slice(0, 300) },
      })
      .catch(() => {});

    return NextResponse.json({ body: text, warning, check, problem });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Contract rewrite error:", error);
    return NextResponse.json({ error: "Не получилось переписать договор" }, { status: 500 });
  }
}
