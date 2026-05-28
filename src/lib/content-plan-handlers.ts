// Telegram bot handlers for ContentPlan commands.
// Keeps telegram-bot.ts (already 1259 lines) lean — only thin wiring there.

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, sendTelegramMessageWithButtons } from "@/lib/telegram";
import {
  getTopBacklog,
  getNextTopic,
  getTodayBatch,
  markScheduled,
  deferTopic,
  skipTopic,
  enrichSkeletonBrief,
  persistEnrichedBrief,
  fetchTopicById,
  setActiveContentPlanOnSession,
  getRecentUnlinkedPosts,
  linkPostToTopic,
  type ContentPlanRow,
  type NextTopicResult,
} from "@/lib/content-plan";
import {
  formatBacklog,
  formatTopic,
  formatTodayBatchHeader,
  AUDIENCE_LABEL,
  AUDIENCE_ICON,
} from "@/lib/content-plan-formatter";
import { getAudienceForDay } from "@/lib/content-plan-rubric";
import type { ContentBrief } from "@/lib/content-plan-types";

// ─────────────────────────────────────────────────────
// /content-plan — backlog overview
// ─────────────────────────────────────────────────────

export async function handleContentPlanCommand(chatId: string): Promise<void> {
  const now = new Date();
  const audience = getAudienceForDay(now);
  const backlog = await getTopBacklog(undefined, 10, now);

  if (backlog.length === 0) {
    await sendTelegramMessage(
      chatId,
      "📭 <b>Бэклог пуст.</b>\n\nЗапусти seed: <code>npx tsx prisma/seed-content-plan.ts</code>"
    );
    return;
  }

  await sendTelegramMessage(chatId, formatBacklog(backlog, audience));

  // Buttons for top 5 to avoid Telegram payload limits
  for (const row of backlog.slice(0, 5)) {
    await sendTelegramMessageWithButtons(
      chatId,
      `<b>${escape(row.title)}</b>\n<i>${shortMeta(row)}</i>`,
      [
        [
          { text: "🎬 Снять", callback_data: `cp_shoot:${row.id}` },
          { text: "⏭ Позже", callback_data: `cp_defer:${row.id}` },
        ],
        [{ text: "🚫 Пропустить", callback_data: `cp_skip:${row.id}` }],
      ]
    );
  }
}

function shortMeta(row: ContentPlanRow): string {
  const audLabel = AUDIENCE_LABEL[row.audience];
  return `${row.format} · ${audLabel} · приоритет ${row.effectivePriority}`;
}

// ─────────────────────────────────────────────────────
// /next-topic — single topic for today's audience
// ─────────────────────────────────────────────────────

export async function handleNextTopicCommand(chatId: string): Promise<void> {
  const now = new Date();
  const audience = getAudienceForDay(now);
  let result = await getNextTopic(audience, [], now);

  result = await enrichIfSkeleton(result);
  await sendTopicWithButtons(chatId, result);
}

// ─────────────────────────────────────────────────────
// /today — daily batch (3 themes during burst, 1 after fest)
// ─────────────────────────────────────────────────────

export async function handleTodayCommand(chatId: string): Promise<void> {
  const batch = await getTodayBatch(new Date());

  await sendTelegramMessage(chatId, formatTodayBatchHeader(batch));

  if (batch.topics.length === 0 || batch.topics.every((t) => !t.topic)) {
    await sendTelegramMessage(chatId, "📭 Тем на сегодня нет. Запусти <code>/content-plan</code> чтобы посмотреть весь бэклог.");
    return;
  }

  for (let i = 0; i < batch.topics.length; i++) {
    const topicResult = await enrichIfSkeleton(batch.topics[i]);
    await sendTopicWithButtons(chatId, topicResult);
  }
}

// ─────────────────────────────────────────────────────
// /link-to-topic — post-hoc link picker (no args)
// ─────────────────────────────────────────────────────

export async function handleLinkToTopicCommand(chatId: string): Promise<void> {
  const posts = await getRecentUnlinkedPosts(chatId, 5);
  if (posts.length === 0) {
    await sendTelegramMessage(
      chatId,
      "📭 Нет недавних опубликованных постов без привязки к теме плана.\n\nЛибо все посты уже связаны, либо ты ещё ничего не публиковал через этот чат."
    );
    return;
  }

  const buttons = posts.map((p) => {
    const caption = p.caption.replace(/\n/g, " ").slice(0, 50);
    const date = p.publishedAt?.toLocaleDateString("ru-RU") || "";
    return [{ text: `${date} — ${caption}…`, callback_data: `cp_link_post:${p.id}` }];
  });

  await sendTelegramMessageWithButtons(
    chatId,
    "🔗 <b>Выбери опубликованный пост</b> для связи с темой плана:",
    buttons
  );
}

// ─────────────────────────────────────────────────────
// cp_* callback dispatcher (called from telegram-bot.ts:handleInstagramCallbackQuery)
// Returns true if callback was a cp_* and handled.
// ─────────────────────────────────────────────────────

export async function handleContentPlanCallback(
  chatId: string,
  callbackData: string
): Promise<boolean> {
  if (!callbackData.startsWith("cp_")) return false;

  const colonIdx = callbackData.indexOf(":");
  if (colonIdx === -1) return false;

  const action = callbackData.substring(0, colonIdx);
  const arg = callbackData.substring(colonIdx + 1);

  switch (action) {
    case "cp_shoot":
      await handleShoot(chatId, arg);
      break;
    case "cp_defer":
      await handleDefer(chatId, arg);
      break;
    case "cp_skip":
      await handleSkipPrompt(chatId, arg);
      break;
    case "cp_skip_reason":
      await handleSkipReason(chatId, arg);
      break;
    case "cp_link_post":
      await handleLinkPostPicked(chatId, arg);
      break;
    case "cp_link_topic":
      await handleLinkTopicPicked(chatId, arg);
      break;
    default:
      return false;
  }
  return true;
}

async function handleShoot(chatId: string, topicId: string): Promise<void> {
  // Ensure InstagramSession exists for this chat first — bot needs a master
  const session = await prisma.instagramSession.findUnique({ where: { chatId } });
  if (!session) {
    await sendTelegramMessage(
      chatId,
      "⚠️ Сначала запусти <code>/post</code> чтобы войти в режим сбора фото — а потом из <code>/next-topic</code> жми «🎬 Снять»."
    );
    return;
  }

  // Enrich skeleton brief now (one-time persist)
  const topic = await fetchTopicById(topicId);
  if (!topic) {
    await sendTelegramMessage(chatId, "⚠️ Тема не найдена. Возможно её удалили.");
    return;
  }

  let brief: ContentBrief = topic.brief;
  if (topic.isBriefSkeleton) {
    brief = await enrichSkeletonBrief(topic.brief, topic.feature, topic.audience, topic.format, topic.title);
    await persistEnrichedBrief(topicId, brief);
  }

  await setActiveContentPlanOnSession(chatId, topicId);
  await markScheduled(topicId);

  const fullBrief = formatTopic({ topic: { ...topic, brief }, reason: "audience" });
  await sendTelegramMessage(chatId, `🎬 <b>Тема выбрана.</b> Снимай по брифу ниже, потом скидывай медиа сюда — обычным флоу /post.`);
  await sendTelegramMessage(chatId, fullBrief);
}

async function handleDefer(chatId: string, topicId: string): Promise<void> {
  await deferTopic(topicId);
  await sendTelegramMessage(chatId, "⏭ Отложено. Приоритет снижен — тема всплывёт позже.");
}

async function handleSkipPrompt(chatId: string, topicId: string): Promise<void> {
  await sendTelegramMessageWithButtons(
    chatId,
    "🚫 <b>Почему пропускаем?</b>",
    [
      [{ text: "Не актуально", callback_data: `cp_skip_reason:${topicId}|stale` }],
      [{ text: "Уже снимал", callback_data: `cp_skip_reason:${topicId}|done` }],
      [{ text: "Не нравится", callback_data: `cp_skip_reason:${topicId}|dislike` }],
    ]
  );
}

async function handleSkipReason(chatId: string, arg: string): Promise<void> {
  const [topicId, reasonCode] = arg.split("|");
  const reasonMap: Record<string, string> = {
    stale: "не актуально",
    done: "уже снимал",
    dislike: "не нравится",
  };
  const reason = reasonMap[reasonCode] || reasonCode || "не указано";
  await skipTopic(topicId, reason);
  await sendTelegramMessage(chatId, `🚫 Пропущено: <i>${escape(reason)}</i>`);
}

async function handleLinkPostPicked(chatId: string, postId: string): Promise<void> {
  const topics = await getTopBacklog(undefined, 5, new Date());
  if (topics.length === 0) {
    await sendTelegramMessage(chatId, "📭 Нет доступных тем в бэклоге для линковки.");
    return;
  }

  const buttons = topics.map((t) => [
    {
      text: `${t.format} · ${AUDIENCE_ICON[t.audience]} · ${shorten(t.title, 40)}`,
      callback_data: `cp_link_topic:${postId}|${t.id}`,
    },
  ]);

  await sendTelegramMessageWithButtons(
    chatId,
    "🔗 <b>К какой теме привязать?</b>",
    buttons
  );
}

async function handleLinkTopicPicked(chatId: string, arg: string): Promise<void> {
  const [postId, topicId] = arg.split("|");
  if (!postId || !topicId) {
    await sendTelegramMessage(chatId, "⚠️ Не удалось разобрать аргументы линковки.");
    return;
  }
  await linkPostToTopic(postId, topicId);
  await sendTelegramMessage(chatId, "✅ Пост привязан к теме плана.");
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

async function enrichIfSkeleton(result: NextTopicResult): Promise<NextTopicResult> {
  if (!result.topic || !result.topic.isBriefSkeleton) return result;

  // Enrich in-memory only — do NOT persist on view
  // (persistence happens in handleShoot when user actually commits)
  const t = result.topic;
  try {
    const enriched = await enrichSkeletonBrief(t.brief, t.feature, t.audience, t.format, t.title);
    return {
      ...result,
      topic: { ...t, brief: enriched },
    };
  } catch (err) {
    console.error("[content-plan-handlers] enrichSkeletonBrief failed:", err);
    return result;
  }
}

async function sendTopicWithButtons(chatId: string, result: NextTopicResult): Promise<void> {
  const text = formatTopic(result);
  if (!result.topic) {
    await sendTelegramMessage(chatId, text);
    return;
  }
  await sendTelegramMessageWithButtons(chatId, text, [
    [{ text: "🎬 Снять сейчас", callback_data: `cp_shoot:${result.topic.id}` }],
    [
      { text: "⏭ Следующая", callback_data: `cp_defer:${result.topic.id}` },
      { text: "🚫 Не моё", callback_data: `cp_skip:${result.topic.id}` },
    ],
  ]);
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shorten(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
