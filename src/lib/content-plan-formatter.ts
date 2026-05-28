import type { ContentPlanRow, NextTopicResult, TodayBatch } from "@/lib/content-plan";
import type { ContentAudience, ContentFormat, ContentFeature } from "@/generated/prisma/enums";
import type { ContentBrief, ShotInstruction } from "@/lib/content-plan-types";

const AUDIENCE_ICON: Record<ContentAudience, string> = {
  MASTERS: "👤",
  CLIENTS: "👥",
  BOTH: "🌐",
};

const AUDIENCE_LABEL: Record<ContentAudience, string> = {
  MASTERS: "Мастера",
  CLIENTS: "Клиенты",
  BOTH: "Все",
};

const FORMAT_ICON: Record<ContentFormat, string> = {
  REELS: "🎬",
  CAROUSEL: "🎠",
  POST: "🖼",
};

const FORMAT_LABEL: Record<ContentFormat, string> = {
  REELS: "Reels",
  CAROUSEL: "Carousel",
  POST: "Post",
};

const FEATURE_LABEL: Record<ContentFeature, string> = {
  ONBOARDING: "Онбординг",
  TECH_PASSPORT_AI: "AI тех.паспорт",
  MEASUREMENT: "Замер",
  BLE_RULER: "BLE-рулетка",
  CONSTRUCTOR_3D: "3D-конструктор",
  KP: "КП",
  CONTRACT: "Договор",
  CRM: "Mini-CRM",
  PRICE_LIST: "Прайс",
  PORTFOLIO: "Портфолио",
  GENERAL: "Общее",
};

const SHOT_TYPE_LABEL: Record<ShotInstruction["type"], string> = {
  screen_recording: "Запись экрана",
  phone_camera: "Камера телефона",
  object_closeup: "Closeup",
  before_after: "До/После",
};

export function formatBacklog(rows: ContentPlanRow[], audience: ContentAudience): string {
  const lines: string[] = [];
  lines.push(`📋 <b>Бэклог</b> (топ-${rows.length}, сегодня: ${AUDIENCE_ICON[audience]} ${AUDIENCE_LABEL[audience].toLowerCase()})`);
  lines.push("");
  rows.forEach((r, idx) => {
    const seriesTag = r.series ? ` · 🎞 <i>${r.series} ${r.seriesOrder ?? ""}</i>` : "";
    const releaseTag = r.releaseTag ? ` · 🆕 <i>${r.releaseTag}</i>` : "";
    const boostStr = r.boost > 0 ? ` (${r.priority}+${r.boost})` : "";
    lines.push(
      `${idx + 1}. ${FORMAT_ICON[r.format]} ${FORMAT_LABEL[r.format]} · ${AUDIENCE_ICON[r.audience]} · ${r.effectivePriority}${boostStr}${seriesTag}${releaseTag}`
    );
    lines.push(`   «${escapeHtml(r.title)}»`);
  });
  return lines.join("\n");
}

export function formatTopic(result: NextTopicResult): string {
  const { topic, reason, warning } = result;
  if (!topic) {
    return "📭 <b>Бэклог исчерпан.</b>\n\nВсе темы либо опубликованы либо пропущены. Запусти seed заново или подкинь идей.";
  }

  const brief = topic.brief;
  const lines: string[] = [];

  // Header
  const seriesBadge = topic.series ? ` 🎞 <i>${topic.series} ${topic.seriesOrder ?? ""}</i>` : "";
  const releaseBadge = topic.releaseTag ? ` 🆕 <i>${topic.releaseTag}</i>` : "";
  lines.push(`🎬 <b>Тема:</b> ${escapeHtml(topic.title)}${seriesBadge}${releaseBadge}`);

  const audienceLine = `${AUDIENCE_ICON[topic.audience]} ${AUDIENCE_LABEL[topic.audience]}`;
  const featureLine = FEATURE_LABEL[topic.feature];
  const formatLine = `${FORMAT_ICON[topic.format]} ${FORMAT_LABEL[topic.format]}`;
  const durationLine = brief.durationSec ? ` · ${brief.durationSec} сек` : "";
  lines.push(`${formatLine}${durationLine} · ${audienceLine} · ${featureLine} · приоритет ${topic.effectivePriority}`);

  if (warning) {
    lines.push("");
    lines.push(`⚠️ <i>${escapeHtml(warning)}</i>`);
  }

  if (reason === "series") {
    lines.push("");
    lines.push(`📚 <i>Идёт серия — выходит вне рубрикации по порядку</i>`);
  } else if (reason === "scheduled") {
    lines.push("");
    lines.push(`📅 <i>Триггер по дате (scheduledFor)</i>`);
  } else if (reason === "release") {
    lines.push("");
    lines.push(`🚀 <i>Релизная тема — приоритет над рубрикой</i>`);
  }

  // Hook
  lines.push("");
  lines.push(`💡 <b>Хук:</b>`);
  lines.push(escapeHtml(brief.hook));

  // Problem & solution
  if (brief.problem) {
    lines.push("");
    lines.push(`😩 <b>Боль:</b> ${escapeHtml(brief.problem)}`);
  }
  if (brief.solution) {
    lines.push(`✅ <b>Решение:</b> ${escapeHtml(brief.solution)}`);
  }

  // Shot list
  if (brief.shotList.length > 0) {
    lines.push("");
    lines.push(`📸 <b>Что снять (${brief.shotList.length} ${pluralKadrov(brief.shotList.length)}):</b>`);
    brief.shotList.forEach((s, idx) => {
      const dur = s.durationSec ? ` ${s.durationSec}с` : "";
      const cover = brief.coverIndex === idx ? "  👈 <i>обложка</i>" : "";
      lines.push(` ${s.order}. [${SHOT_TYPE_LABEL[s.type]}${dur}] ${escapeHtml(s.description)}${cover}`);
      if (s.overlayText) {
        lines.push(`    └ overlay: «${escapeHtml(s.overlayText)}»`);
      }
    });
  }

  // Voice over
  if (brief.voiceOver) {
    lines.push("");
    lines.push(`🎤 <b>Озвучка:</b>`);
    lines.push(`<i>${escapeHtml(brief.voiceOver)}</i>`);
  }

  // CTA
  lines.push("");
  lines.push(`📢 <b>CTA:</b> ${escapeHtml(brief.cta)}`);

  // Hashtags
  if (brief.hashtagsHint.length > 0) {
    lines.push(`🏷 ${brief.hashtagsHint.map(escapeHtml).join(" ")}`);
  }

  // Tech notes
  if (brief.techNotes) {
    lines.push("");
    lines.push(`🛠 <i>${escapeHtml(brief.techNotes)}</i>`);
  }

  return lines.join("\n");
}

export function formatTodayBatchHeader(batch: TodayBatch): string {
  const dateStr = batch.date.toLocaleDateString("ru-RU", {
    timeZone: "Asia/Almaty",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const audLabel = AUDIENCE_LABEL[batch.audience].toLowerCase();
  const audIcon = AUDIENCE_ICON[batch.audience];
  if (batch.quota >= 2) {
    return `📦 <b>Темы на сегодня</b> (${batch.topics.length}/${batch.quota} — burst до феста)\n📅 ${dateStr} · ${audIcon} ${audLabel}`;
  }
  return `📦 <b>Тема дня</b>\n📅 ${dateStr} · ${audIcon} ${audLabel}`;
}

export function formatTopicForBacklogEntry(row: ContentPlanRow): string {
  const seriesTag = row.series ? ` · 🎞 ${row.series} ${row.seriesOrder ?? ""}` : "";
  return `${FORMAT_ICON[row.format]} ${FORMAT_LABEL[row.format]} · ${AUDIENCE_ICON[row.audience]} · ${row.effectivePriority}${seriesTag}\n«${escapeHtml(row.title)}»`;
}

function pluralKadrov(n: number): string {
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "кадров";
  if (lastDigit === 1) return "кадр";
  if (lastDigit >= 2 && lastDigit <= 4) return "кадра";
  return "кадров";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export { AUDIENCE_LABEL, AUDIENCE_ICON, FORMAT_ICON, FORMAT_LABEL };

// Re-export brief type for convenience
export type { ContentBrief };
