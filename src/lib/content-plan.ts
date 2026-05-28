import { prisma } from "@/lib/prisma";
import { getOpenRouter } from "@/lib/openrouter";
import { getAudienceForDay, getDailyQuota } from "@/lib/content-plan-rubric";
import { DEFAULT_TECH_NOTES } from "@/lib/content-plan-types";
import type {
  ContentAudience,
  ContentFeature,
  ContentFormat,
  ContentPlanStatus,
} from "@/generated/prisma/enums";
import type { ContentBrief } from "@/lib/content-plan-types";

const VISION_MODEL = "anthropic/claude-sonnet-4";
const MAX_BOOST = 30; // capped at 6 weeks in backlog
const TTL_HOURS = 24;
const STALE_SCHEDULED_DAYS = 7;

export interface ContentPlanRow {
  id: string;
  masterId: string | null;
  title: string;
  feature: ContentFeature;
  format: ContentFormat;
  audience: ContentAudience;
  priority: number;
  status: ContentPlanStatus;
  brief: ContentBrief;
  isBriefSkeleton: boolean;
  releaseTag: string | null;
  series: string | null;
  seriesOrder: number | null;
  scheduledFor: Date | null;
  skipReason: string | null;
  publishedAt: Date | null;
  inBacklogSince: Date;
  instagramPostId: string | null;
  createdAt: Date;
  updatedAt: Date;
  effectivePriority: number;
  boost: number;
}

function weeksSince(date: Date, now: Date): number {
  const ms = now.getTime() - date.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function computeBoost(inBacklogSince: Date, now: Date): number {
  return Math.min(MAX_BOOST, weeksSince(inBacklogSince, now) * 5);
}

function withEffectivePriority<T extends { priority: number; inBacklogSince: Date; brief: unknown }>(
  row: T,
  now: Date
): T & { effectivePriority: number; boost: number; brief: ContentBrief } {
  const boost = computeBoost(row.inBacklogSince, now);
  return {
    ...row,
    boost,
    effectivePriority: row.priority + boost,
    brief: row.brief as ContentBrief,
  };
}

// Themes are pickable if IDEA, OR SCHEDULED but stale (>7d) — prevents
// dead-locks where user tapped "Shoot" but never finished the session.
function pickableWhere(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const cutoff = new Date(Date.now() - STALE_SCHEDULED_DAYS * 24 * 60 * 60 * 1000);
  return {
    AND: [
      extra,
      {
        OR: [
          { status: "IDEA" },
          { status: "SCHEDULED", updatedAt: { lt: cutoff } },
        ],
      },
    ],
  };
}

// ─────────────────────────────────────────────────────
// Selection: getNextTopic with priority chain
// ─────────────────────────────────────────────────────

export interface NextTopicResult {
  topic: ContentPlanRow | null;
  reason: "series" | "scheduled" | "release" | "audience" | "fallback_both" | "fallback_any" | "empty";
  warning?: string;
}

export async function getNextTopic(
  audience: ContentAudience,
  excludeIds: string[] = [],
  now: Date = new Date()
): Promise<NextTopicResult> {
  const excludeFilter = excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {};

  // 1. Series (master-class etc) — strict order, ignores audience
  const seriesTopic = await prisma.contentPlan.findFirst({
    where: pickableWhere({ ...excludeFilter, series: { not: null } }),
    orderBy: [{ series: "asc" }, { seriesOrder: "asc" }],
  });
  if (seriesTopic) {
    return { topic: withEffectivePriority(seriesTopic, now), reason: "series" };
  }

  // 2. Scheduled themes (fest-2026 by date) — trigger within last 3 days
  const scheduledTopic = await prisma.contentPlan.findFirst({
    where: pickableWhere({
      ...excludeFilter,
      scheduledFor: {
        lte: now,
        gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
    }),
    orderBy: { scheduledFor: "asc" },
  });
  if (scheduledTopic) {
    return { topic: withEffectivePriority(scheduledTopic, now), reason: "scheduled" };
  }

  // 3. Release themes — ignore audience
  const releaseTopic = await prisma.contentPlan.findFirst({
    where: pickableWhere({ ...excludeFilter, releaseTag: { not: null } }),
    orderBy: { priority: "desc" },
  });
  if (releaseTopic) {
    return { topic: withEffectivePriority(releaseTopic, now), reason: "release" };
  }

  // 4. Main audience filter — picked by effective priority
  // (Prisma can't compute effectivePriority server-side; fetch top N by base priority,
  // then resort by effectivePriority in memory.)
  async function pickByAudience(aud: ContentAudience): Promise<ContentPlanRow | null> {
    const candidates = await prisma.contentPlan.findMany({
      where: pickableWhere({ ...excludeFilter, audience: aud }),
      orderBy: { priority: "desc" },
      take: 20,
    });
    if (candidates.length === 0) return null;
    const ranked = candidates
      .map((c) => withEffectivePriority(c, now))
      .sort((a, b) => b.effectivePriority - a.effectivePriority);
    return ranked[0];
  }

  const primary = await pickByAudience(audience);
  if (primary) {
    return { topic: primary, reason: "audience" };
  }

  // 5. Fallback 1: try BOTH if today wasn't BOTH already
  if (audience !== "BOTH") {
    const both = await pickByAudience("BOTH");
    if (both) {
      return {
        topic: both,
        reason: "fallback_both",
        warning: `Сегодня по плану ${labelAudience(audience)}, но темы под эту аудиторию закончились — показываю универсальную.`,
      };
    }
  }

  // 6. Fallback 2: any IDEA at all
  const anyTopic = await prisma.contentPlan.findFirst({
    where: pickableWhere(excludeFilter),
    orderBy: { priority: "desc" },
    take: 1,
  });
  if (anyTopic) {
    return {
      topic: withEffectivePriority(anyTopic, now),
      reason: "fallback_any",
      warning: `Сегодня по плану ${labelAudience(audience)}, но подходящих тем нет — беру следующую по приоритету.`,
    };
  }

  return { topic: null, reason: "empty" };
}

function labelAudience(a: ContentAudience): string {
  if (a === "MASTERS") return "мастера";
  if (a === "CLIENTS") return "клиенты";
  return "микс";
}

// ─────────────────────────────────────────────────────
// /today — daily batch (3 themes during burst, 1 after fest)
// ─────────────────────────────────────────────────────

export interface TodayBatch {
  date: Date;
  audience: ContentAudience;
  quota: number;
  topics: NextTopicResult[];
}

export async function getTodayBatch(now: Date = new Date()): Promise<TodayBatch> {
  const audience = getAudienceForDay(now);
  const quota = getDailyQuota(now);

  const picked: NextTopicResult[] = [];
  const excludeIds: string[] = [];
  for (let i = 0; i < quota; i++) {
    const result = await getNextTopic(audience, excludeIds, now);
    if (!result.topic) {
      if (i === 0) picked.push(result);
      break;
    }
    picked.push(result);
    excludeIds.push(result.topic.id);
  }

  return { date: now, audience, quota, topics: picked };
}

// ─────────────────────────────────────────────────────
// Backlog overview (/content-plan)
// ─────────────────────────────────────────────────────

export async function getTopBacklog(
  audience?: ContentAudience,
  limit = 10,
  now: Date = new Date()
): Promise<ContentPlanRow[]> {
  const where: Record<string, unknown> = audience ? { audience } : {};
  const candidates = await prisma.contentPlan.findMany({
    where: pickableWhere(where),
    orderBy: { priority: "desc" },
    take: limit * 2,
  });
  return candidates
    .map((c) => withEffectivePriority(c, now))
    .sort((a, b) => b.effectivePriority - a.effectivePriority)
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────
// State transitions
// ─────────────────────────────────────────────────────

export async function markScheduled(id: string): Promise<void> {
  await prisma.contentPlan.update({
    where: { id },
    data: { status: "SCHEDULED" },
  });
}

export async function deferTopic(id: string): Promise<void> {
  const topic = await prisma.contentPlan.findUnique({ where: { id }, select: { priority: true } });
  if (!topic) return;
  await prisma.contentPlan.update({
    where: { id },
    data: { priority: Math.max(0, topic.priority - 10) },
  });
}

export async function skipTopic(id: string, reason: string): Promise<void> {
  await prisma.contentPlan.update({
    where: { id },
    data: { status: "SKIPPED", skipReason: reason },
  });
}

// Link AFTER successful Graph API publish.
// contentPlanId is stored in InstagramPost.agentAnalysis.contentPlanId at create time
// (since InstagramSession is deleted before publish — see processCollectedPhotos).
// TTL still enforced via InstagramPost.createdAt to ignore very stale drafts.
export async function linkContentPlanByPostId(
  postId: string,
  postStatus: "PUBLISHED" | "SCHEDULED"
): Promise<void> {
  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    select: { agentAnalysis: true, createdAt: true },
  });
  if (!post) return;

  const analysis = post.agentAnalysis as Record<string, unknown> | null;
  const contentPlanId = analysis?.contentPlanId as string | undefined;
  if (!contentPlanId) return;

  // TTL: 24h between draft creation and actual publish
  const ageMs = Date.now() - post.createdAt.getTime();
  if (ageMs > TTL_HOURS * 60 * 60 * 1000) return;

  await prisma.contentPlan.update({
    where: { id: contentPlanId },
    data: {
      instagramPostId: postId,
      status: postStatus,
      publishedAt: postStatus === "PUBLISHED" ? new Date() : null,
    },
  });
}

// Read active ContentPlanId from session (called right before session is deleted
// in processCollectedPhotos, so the value can be threaded through to InstagramPost).
export async function getActiveContentPlanIdFromSession(chatId: string): Promise<string | null> {
  const session = await prisma.instagramSession.findUnique({
    where: { chatId },
    select: { activeContentPlanId: true, activeContentPlanSetAt: true },
  });
  if (!session?.activeContentPlanId || !session.activeContentPlanSetAt) return null;
  const ageMs = Date.now() - session.activeContentPlanSetAt.getTime();
  if (ageMs > TTL_HOURS * 60 * 60 * 1000) return null;
  return session.activeContentPlanId;
}

// Called by /link-to-topic picker (post-hoc).
// Searches via instagramPost.telegramChatId since session is gone by then.
export async function linkPostToTopic(postId: string, topicId: string): Promise<void> {
  await prisma.contentPlan.update({
    where: { id: topicId },
    data: {
      instagramPostId: postId,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
}

// ─────────────────────────────────────────────────────
// Skeleton brief enrichment (LLM)
// In-memory by default; persist only on cp_shoot_*.
// ─────────────────────────────────────────────────────

const ENRICHMENT_SYSTEM_PROMPT = `Ты — копирайтер-режиссёр Instagram-Reels для SaaS-приложения PotolokAI (мобильное приложение для мастеров натяжных потолков в Казахстане).

Твоя задача — превратить короткий "скелет" темы поста в полноценный бриф для съёмки.

ВХОДНЫЕ ДАННЫЕ:
- title: о чём пост
- feature: какая фича приложения освещается
- audience: MASTERS (мастера-подписчики SaaS) / CLIENTS (клиенты мастеров) / BOTH
- hook (короткий): начальная зацепка

ВЫХОДНЫЕ ДАННЫЕ — JSON строго по схеме:
{
  "hook": "<1-2 предложения, цепляет внимание в первые 2 секунды>",
  "problem": "<боль аудитории — одно предложение>",
  "solution": "<как фича решает — одно предложение>",
  "shotList": [
    {
      "order": 1,
      "type": "screen_recording" | "phone_camera" | "object_closeup" | "before_after",
      "durationSec": <2-8>,
      "description": "<что заснять — конкретно>",
      "overlayText": "<подпись на экране, опционально>"
    },
    ...3-5 кадров...
  ],
  "voiceOver": "<готовый текст озвучки 25-35 секунд, разговорный казахстанский русский, без штампов>",
  "cta": "<призыв к действию, например 'Скачай в App Store — ссылка в био'>",
  "hashtagsHint": ["#натяжныепотолки", "#потолкиастана", ..., 5-7 тегов: 2-3 общих + 2 нишевых по фиче + 2-3 KZ-локальных (#астана #ремонтастана)],
  "coverIndex": <индекс в shotList для обложки, обычно последний — финальный результат>,
  "durationSec": <общая длительность 20-45>,
  "techNotes": "Запиши через iOS Control Center → Запись экрана. Готовое видео — AirDrop на Mac для монтажа."
}

ПРАВИЛА:
- Тон: дружелюбный мастер, без пафоса
- KZ-контекст: упоминай Астану/Казахстан где уместно
- shotList: 70% screen_recording для туториалов мастеров, для клиентов больше object_closeup и before_after
- НЕ пиши caption — это работа другого агента
- Только JSON, без markdown, без пояснений`;

export async function enrichSkeletonBrief(
  partial: ContentBrief,
  feature: ContentFeature,
  audience: ContentAudience,
  format: ContentFormat,
  title: string
): Promise<ContentBrief> {
  const userPayload = {
    title,
    feature,
    audience,
    format,
    hookHint: partial.hook,
    skeletonShots: partial.shotList,
  };

  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: ENRICHMENT_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    stream: false,
    max_tokens: 1500,
    temperature: 0.7,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    return { ...partial, techNotes: partial.techNotes || DEFAULT_TECH_NOTES };
  }

  try {
    const parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1)) as Partial<ContentBrief>;
    return {
      hook: parsed.hook || partial.hook,
      problem: parsed.problem || "",
      solution: parsed.solution || "",
      shotList: parsed.shotList && parsed.shotList.length >= 3 ? parsed.shotList : partial.shotList,
      voiceOver: parsed.voiceOver,
      cta: parsed.cta || "Скачай PotolokAI — ссылка в био",
      hashtagsHint: parsed.hashtagsHint && parsed.hashtagsHint.length >= 5
        ? parsed.hashtagsHint
        : ["#натяжныепотолки", "#потолкиастана", "#астана", "#ремонтастана", "#дизайнинтерьера"],
      coverIndex: parsed.coverIndex,
      durationSec: parsed.durationSec,
      techNotes: parsed.techNotes || DEFAULT_TECH_NOTES,
    };
  } catch (err) {
    console.error("[content-plan] Skeleton enrichment JSON parse failed:", err);
    return { ...partial, techNotes: partial.techNotes || DEFAULT_TECH_NOTES };
  }
}

export async function persistEnrichedBrief(id: string, brief: ContentBrief): Promise<void> {
  await prisma.contentPlan.update({
    where: { id },
    data: {
      brief: JSON.parse(JSON.stringify(brief)),
      isBriefSkeleton: false,
    },
  });
}

// ─────────────────────────────────────────────────────
// Active topic management on /post sessions
// ─────────────────────────────────────────────────────

export async function setActiveContentPlanOnSession(
  chatId: string,
  topicId: string
): Promise<void> {
  await prisma.instagramSession.update({
    where: { chatId },
    data: { activeContentPlanId: topicId, activeContentPlanSetAt: new Date() },
  });
}

export async function clearActiveContentPlanOnSession(chatId: string): Promise<void> {
  // upsert-style: only update if session exists
  await prisma.instagramSession
    .update({
      where: { chatId },
      data: { activeContentPlanId: null, activeContentPlanSetAt: null },
    })
    .catch(() => {
      // session may not exist yet — that's fine
    });
}

export async function fetchTopicById(id: string): Promise<ContentPlanRow | null> {
  const row = await prisma.contentPlan.findUnique({ where: { id } });
  if (!row) return null;
  return withEffectivePriority(row, new Date());
}

// ─────────────────────────────────────────────────────
// /link-to-topic picker queries
// ─────────────────────────────────────────────────────

export async function getRecentUnlinkedPosts(chatId: string, limit = 5) {
  return prisma.instagramPost.findMany({
    where: {
      status: "PUBLISHED",
      contentPlan: null,
      telegramChatId: chatId,
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      caption: true,
      publishedAt: true,
    },
  });
}
