import type { ContentAudience } from "@/generated/prisma/enums";

// Day-of-week rubric: Mon/Wed/Fri = masters (B2B SaaS),
// Tue/Thu/Sat = clients (B2C through masters), Sun = mix.
// Prevents IG algo confusion from mixed B2B/B2C signals in one feed.
export function getAudienceForDay(date: Date): ContentAudience {
  const dow = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (dow === 1 || dow === 3 || dow === 5) return "MASTERS";
  if (dow === 2 || dow === 4 || dow === 6) return "CLIENTS";
  return "BOTH";
}

// Burst mode until Potolok Fest 18-19 June 2026: 3 posts/day to build
// account presence so visitors arrive at the booth already familiar
// with the app. After the fest — back to 1 post/day.
const FEST_END = new Date("2026-06-19T00:00:00Z");

export function getDailyQuota(date: Date): number {
  return date < FEST_END ? 3 : 1;
}
