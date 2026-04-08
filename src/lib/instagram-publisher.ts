// Instagram Publisher — orchestrates the full pipeline:
// 1. Receives photos from Telegram
// 2. Uploads to Vercel Blob
// 3. Runs 5-agent pipeline
// 4. Creates InstagramPost in DB
// 5. Sends preview to Telegram
// 6. Handles approval → publishes via Instagram Graph API

import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { runInstagramPipeline, type InstagramPipelineResult } from "@/lib/instagram-agents";
import { publishCarouselPost } from "@/lib/instagram";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTelegramPhoto,
} from "@/lib/telegram";

// ─────────────────────────────────────────────────────
// Upload photos to Vercel Blob
// ─────────────────────────────────────────────────────

export async function uploadPhotosToBlob(
  masterId: string,
  photoBuffers: Buffer[]
): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < photoBuffers.length; i++) {
    const timestamp = Date.now();
    const path = `instagram/${masterId}/${timestamp}-${i}.jpg`;

    const blob = await put(path, photoBuffers[i], {
      access: "public",
      contentType: "image/jpeg",
    });

    urls.push(blob.url);
  }

  return urls;
}

// ─────────────────────────────────────────────────────
// Run pipeline and create draft post
// ─────────────────────────────────────────────────────

export async function processInstagramPhotos(
  masterId: string,
  chatId: string,
  photoBase64Urls: string[],
  blobUrls: string[],
  userContext?: string,
  mediaTypes?: ("photo" | "video")[]
): Promise<string | null> {
  // Get recent post dates for scheduler
  const account = await prisma.instagramAccount.findUnique({
    where: { masterId },
    include: {
      posts: {
        where: { status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 7,
        select: { publishedAt: true },
      },
    },
  });

  if (!account) {
    await sendTelegramMessage(
      chatId,
      "❌ Instagram аккаунт не привязан.\n\nОбратитесь к администратору для настройки."
    );
    return null;
  }

  const recentPostDates = account.posts
    .filter((p) => p.publishedAt)
    .map((p) => p.publishedAt!.toISOString());

  // Run 5-agent pipeline
  let pipelineResult: InstagramPipelineResult;
  try {
    pipelineResult = await runInstagramPipeline(photoBase64Urls, recentPostDates, userContext);
  } catch (error) {
    console.error("[Instagram Publisher] Pipeline error:", error);
    await sendTelegramMessage(
      chatId,
      "⚠️ AI не смог обработать фото. Попробуйте ещё раз."
    );
    return null;
  }

  // Reorder photos based on visual editor recommendation, keeping videos in place
  const types = mediaTypes || blobUrls.map(() => "photo" as const);
  const finalOrder = pipelineResult.visual.final_order;

  // Build photo-index → blobUrls-index mapping
  const photoIndices: number[] = [];
  for (let i = 0; i < types.length; i++) {
    if (types[i] === "photo") photoIndices.push(i);
  }

  // Reorder: first place photos in visual editor's order, then append videos
  let mediaUrls: string[];
  let finalMediaTypes: ("photo" | "video")[];

  const validPhotoOrder = finalOrder.filter((i) => i >= 0 && i < photoIndices.length);
  if (validPhotoOrder.length > 0) {
    // Reordered photos first
    mediaUrls = validPhotoOrder.map((i) => blobUrls[photoIndices[i]]);
    finalMediaTypes = validPhotoOrder.map(() => "photo" as const);
    // Append all videos in original order
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "video") {
        mediaUrls.push(blobUrls[i]);
        finalMediaTypes.push("video");
      }
    }
  } else {
    // Fallback: original order
    mediaUrls = [...blobUrls];
    finalMediaTypes = [...types];
  }

  // Determine media type
  const hasVideo = finalMediaTypes.some(t => t === "video");
  let postMediaType = "IMAGE";
  if (mediaUrls.length > 1) postMediaType = "CAROUSEL";
  else if (hasVideo) postMediaType = "VIDEO";

  // Create InstagramPost in DB
  const post = await prisma.instagramPost.create({
    data: {
      instagramAccountId: account.id,
      caption: pipelineResult.copy.caption,
      hashtags: pipelineResult.copy.hashtags,
      mediaUrls,
      mediaType: postMediaType,
      coverIndex: pipelineResult.visual.cover_index,
      agentAnalysis: JSON.parse(JSON.stringify({ ...pipelineResult, mediaTypes: finalMediaTypes })),
      postType: pipelineResult.strategy.post_type,
      scheduledAt: new Date(pipelineResult.schedule.recommended_datetime),
      status: "PENDING_APPROVAL",
      telegramChatId: chatId,
    },
  });

  // Send preview to Telegram
  await sendPreview(chatId, post.id, pipelineResult, mediaUrls, finalMediaTypes);

  return post.id;
}

// ─────────────────────────────────────────────────────
// Send preview to Telegram with inline buttons
// ─────────────────────────────────────────────────────

async function sendPreview(
  chatId: string,
  postId: string,
  pipeline: InstagramPipelineResult,
  mediaUrls: string[],
  mediaTypes?: ("photo" | "video")[]
): Promise<void> {
  // Send first photo as preview (find first photo URL)
  const types = mediaTypes || mediaUrls.map(() => "photo" as const);
  const firstPhotoIdx = types.indexOf("photo");
  if (firstPhotoIdx >= 0) {
    await sendTelegramPhoto(chatId, mediaUrls[firstPhotoIdx], `📸 Cover фото (1 из ${mediaUrls.length})`);
  }

  // Build media summary
  const photoCount = types.filter(t => t === "photo").length;
  const videoCount = types.filter(t => t === "video").length;
  const mediaSummary = [
    photoCount > 0 ? `${photoCount} фото` : "",
    videoCount > 0 ? `${videoCount} видео` : "",
  ].filter(Boolean).join(" + ");

  // Build preview text
  const scheduleDate = new Date(pipeline.schedule.recommended_datetime);
  const dateStr = scheduleDate.toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const previewText =
    `📝 <b>Превью Instagram поста</b>\n\n` +
    `<b>Тип:</b> ${getPostTypeLabel(pipeline.strategy.post_type)}\n` +
    `<b>Медиа:</b> ${mediaSummary}\n` +
    `<b>Визуал:</b> ${pipeline.visual.visual_score}/10\n` +
    `<b>Время:</b> ${dateStr}\n` +
    `<i>${pipeline.schedule.reason}</i>\n\n` +
    `─────────────────\n\n` +
    `${pipeline.copy.caption}\n\n` +
    `<i>${pipeline.copy.hashtags.substring(0, 200)}${pipeline.copy.hashtags.length > 200 ? "..." : ""}</i>`;

  await sendTelegramMessageWithButtons(chatId, previewText, [
    [
      { text: "🚀 Опубликовать сейчас", callback_data: `ig_now:${postId}` },
    ],
    [
      { text: `📅 Запланировать (${pipeline.schedule.day_of_week})`, callback_data: `ig_schedule:${postId}` },
    ],
    [
      { text: "✏️ Другой текст", callback_data: `ig_alt:${postId}` },
      { text: "❌ Отмена", callback_data: `ig_reject:${postId}` },
    ],
  ]);
}

// ─────────────────────────────────────────────────────
// Handle callback actions from Telegram buttons
// ─────────────────────────────────────────────────────

export async function handleInstagramCallback(
  chatId: string,
  action: string,
  postId: string
): Promise<void> {
  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { account: true },
  });

  if (!post) {
    await sendTelegramMessage(chatId, "❌ Пост не найден.");
    return;
  }

  switch (action) {
    case "ig_now": {
      // Publish immediately
      await sendTelegramMessage(chatId, "⏳ Публикую в Instagram...");

      try {
        const fullCaption = `${post.caption}\n\n${post.hashtags}`;
        const agentData = post.agentAnalysis as Record<string, unknown> | null;
        const savedMediaTypes = (agentData?.mediaTypes as ("photo" | "video")[]) || undefined;

        const mediaId = await publishCarouselPost(
          post.account.instagramUserId,
          post.account.accessToken,
          post.mediaUrls,
          fullCaption,
          savedMediaTypes
        );

        await prisma.instagramPost.update({
          where: { id: postId },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            instagramMediaId: mediaId,
          },
        });

        await sendTelegramMessage(
          chatId,
          `✅ <b>Опубликовано в Instagram!</b>\n\n` +
          `📱 Проверьте: instagram.com/${post.account.username || "ваш аккаунт"}`
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error("[Instagram Publish] Error:", errMsg);

        await prisma.instagramPost.update({
          where: { id: postId },
          data: { status: "FAILED", errorMessage: errMsg },
        });

        await sendTelegramMessageWithButtons(
          chatId,
          `❌ Ошибка публикации: ${errMsg}\n\nПопробуйте ещё раз.`,
          [[{ text: "🔄 Повторить", callback_data: `ig_now:${postId}` }]]
        );
      }
      break;
    }

    case "ig_schedule": {
      // Schedule for recommended time
      await prisma.instagramPost.update({
        where: { id: postId },
        data: { status: "SCHEDULED" },
      });

      const schedDate = post.scheduledAt
        ? post.scheduledAt.toLocaleString("ru-RU", {
            timeZone: "Asia/Almaty",
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "скоро";

      await sendTelegramMessage(
        chatId,
        `📅 <b>Пост запланирован!</b>\n\n` +
        `Будет опубликован: ${schedDate}\n\n` +
        `Я пришлю уведомление когда пост выйдет.`
      );
      break;
    }

    case "ig_alt": {
      // Switch to alternative caption
      const agentData = post.agentAnalysis as Record<string, unknown> | null;
      const altCaption = (agentData?.copy as Record<string, string>)?.alt_caption;

      if (altCaption) {
        await prisma.instagramPost.update({
          where: { id: postId },
          data: { caption: altCaption },
        });

        await sendTelegramMessageWithButtons(
          chatId,
          `✏️ <b>Альтернативный текст:</b>\n\n${altCaption}\n\n<i>${post.hashtags.substring(0, 150)}...</i>`,
          [
            [{ text: "🚀 Опубликовать", callback_data: `ig_now:${postId}` }],
            [{ text: "📅 Запланировать", callback_data: `ig_schedule:${postId}` }],
          ]
        );
      } else {
        await sendTelegramMessage(
          chatId,
          "Альтернативный текст недоступен. Отправьте свой текст — я обновлю пост."
        );
      }
      break;
    }

    case "ig_reject": {
      await prisma.instagramPost.update({
        where: { id: postId },
        data: { status: "REJECTED" },
      });
      await sendTelegramMessage(chatId, "🗑 Пост отклонён. Отправьте новые фото когда будете готовы.");
      break;
    }
  }
}

// ─────────────────────────────────────────────────────
// Publish scheduled posts (called by cron)
// ─────────────────────────────────────────────────────

export async function publishScheduledPosts(): Promise<number> {
  const now = new Date();

  const posts = await prisma.instagramPost.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: { account: true },
  });

  let published = 0;

  for (const post of posts) {
    if (!post.account.isActive) continue;

    try {
      // Mark as publishing
      await prisma.instagramPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHING" },
      });

      const fullCaption = `${post.caption}\n\n${post.hashtags}`;
      const cronAgentData = post.agentAnalysis as Record<string, unknown> | null;
      const cronMediaTypes = (cronAgentData?.mediaTypes as ("photo" | "video")[]) || undefined;

      const mediaId = await publishCarouselPost(
        post.account.instagramUserId,
        post.account.accessToken,
        post.mediaUrls,
        fullCaption,
        cronMediaTypes
      );

      await prisma.instagramPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          instagramMediaId: mediaId,
        },
      });

      // Notify master via Telegram
      if (post.telegramChatId) {
        await sendTelegramMessage(
          post.telegramChatId,
          `✅ <b>Пост опубликован в Instagram!</b>\n\n` +
          `📱 instagram.com/${post.account.username || ""}\n\n` +
          `${post.caption.substring(0, 100)}...`
        );
      }

      published++;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Cron] Failed to publish post ${post.id}:`, errMsg);

      await prisma.instagramPost.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMessage: errMsg },
      });

      // Notify master about failure
      if (post.telegramChatId) {
        await sendTelegramMessage(
          post.telegramChatId,
          `❌ Не удалось опубликовать запланированный пост.\n\nОшибка: ${errMsg}`
        );
      }
    }
  }

  return published;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function getPostTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    before_after: "До/После 🔄",
    showcase: "Витрина работы ✨",
    process: "Процесс монтажа 🔧",
    tips: "Советы 💡",
  };
  return labels[type] || type;
}
