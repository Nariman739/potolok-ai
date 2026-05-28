// ContentPlan brief — stored as JSON in DB (ContentPlan.brief)
// Skeleton briefs only fill hook + minimal shotList; LLM enriches the rest
// when user taps "🎬 Снять сейчас" (see content-plan.ts:enrichSkeletonBrief).

export type ShotType =
  | "screen_recording"
  | "phone_camera"
  | "object_closeup"
  | "before_after";

export interface ShotInstruction {
  order: number;
  type: ShotType;
  durationSec?: number;
  description: string;
  overlayText?: string;
}

export interface ContentBrief {
  hook: string;
  problem: string;
  solution: string;
  shotList: ShotInstruction[];
  voiceOver?: string;
  cta: string;
  hashtagsHint: string[];
  coverIndex?: number;
  durationSec?: number;
  techNotes?: string;
}

export function isSkeletonBrief(brief: ContentBrief): boolean {
  return !brief.problem || !brief.solution || brief.shotList.length < 3;
}

// Default tech note for screen-recording-heavy themes
export const DEFAULT_TECH_NOTES =
  "Запиши через iOS Control Center → Запись экрана. Готовое видео — AirDrop на Mac для монтажа.";
