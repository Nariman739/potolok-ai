// Анонимный журнал ИИ (09.10.2026). См. model AiLog в schema.prisma.
//
// Правила:
//  - НИКАКИХ masterId/companyId/имён — только текст разговора и служебные поля.
//  - Телефоны, почты, ИИН/БИН вырезаются из текста перед записью.
//  - Запись никогда не роняет основную функцию: все ошибки глотаются.
//  - Вызывать с await (на Vercel промис без await не доживает до базы).
//
// Два режима:
//  - стрим/долгий ответ: const id = await aiLogStart(...); ...; await aiLogFinish(id, ...)
//    вопрос сохраняется ДО ответа модели — не теряется, если модель упала;
//  - обычный запрос: await aiLogOnce({...}) после ответа (или в catch с ok:false).

import { prisma } from "@/lib/prisma";

export type AiFeature =
  | "assistant"
  | "quick-estimate"
  | "contract-rewrite"
  | "copy-suggest"
  | "techpassport"
  | "logo-chat"
  | "kp-onboarding";

const MAX_TEXT = 8000;

/** Вырезает телефоны (10–15 цифр), почты и 12-значные ИИН/БИН. Размеры вида «350 на 550» не трогает. */
export function scrubPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[почта]")
    .replace(/\b\d{12}\b/g, "[ИИН]")
    .replace(/\+?\d[\d\s()-]{8,}\d/g, (m) => {
      const digits = m.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15 ? "[тел]" : m;
    });
}

function clip(text: unknown): string {
  const s = typeof text === "string" ? text : text == null ? "" : JSON.stringify(text);
  return scrubPersonal(s).slice(0, MAX_TEXT);
}

type Meta = {
  feature: AiFeature;
  imageCount?: number;
  lang?: string | null;
  platform?: string | null;
  currency?: string | null;
  model?: string | null;
};

type Result = {
  output?: unknown;
  ok: boolean;
  error?: unknown;
  costUsd?: number | null;
  model?: string | null;
};

function errText(e: unknown): string | null {
  if (e == null) return null;
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  // ключи и внутренние ссылки в журнал не пишем
  return `${status ?? ""} ${msg}`.replace(/sk-[\w-]+/g, "[key]").replace(/https?:\/\/\S+/g, "[url]").trim().slice(0, 300);
}

export async function aiLogStart(meta: Meta & { input: unknown }): Promise<string | null> {
  try {
    const row = await prisma.aiLog.create({
      data: {
        feature: meta.feature,
        input: clip(meta.input),
        imageCount: meta.imageCount ?? 0,
        lang: meta.lang ?? null,
        platform: meta.platform ?? null,
        currency: meta.currency ?? null,
        model: meta.model ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[ai-log] start failed:", errText(e));
    return null;
  }
}

export async function aiLogFinish(id: string | null, r: Result): Promise<void> {
  if (!id) return;
  try {
    await prisma.aiLog.update({
      where: { id },
      data: {
        output: r.output === undefined ? undefined : clip(r.output),
        ok: r.ok,
        error: errText(r.error),
        costUsd: r.costUsd ?? undefined,
        model: r.model ?? undefined,
      },
    });
  } catch (e) {
    console.error("[ai-log] finish failed:", errText(e));
  }
}

export async function aiLogOnce(entry: Meta & Result & { input: unknown }): Promise<void> {
  const id = await aiLogStart(entry);
  await aiLogFinish(id, entry);
}
