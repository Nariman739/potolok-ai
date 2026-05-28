export type DealStatusKey =
  | "NEW"
  | "QUALIFIED"      // legacy: показываем как "В работе"
  | "PROPOSAL_SENT"  // legacy
  | "NEGOTIATING"    // legacy
  | "IN_PROGRESS"
  | "WON"
  | "LOST";

export type ClientSourceKey =
  | "INSTAGRAM"
  | "WHATSAPP"
  | "REFERRAL"
  | "SITE"
  | "KASPI"
  | "OTHER";

export type EventTypeKey =
  | "NOTE"
  | "CALL"
  | "MEETING"
  | "WHATSAPP"
  | "MEASUREMENT"
  | "INSTALL"
  | "KP_CREATED"
  | "KP_VIEWED"
  | "KP_CONFIRMED"
  | "KP_REJECTED"
  | "STATUS_CHANGE"
  | "CONTRACT_CREATED"
  | "CONTRACT_SIGNED"
  | "ACT_CREATED"
  | "ACT_SIGNED"
  | "PHOTO_ADDED";

// Legacy статусы (QUALIFIED/PROPOSAL_SENT/NEGOTIATING) показываем как "В работе"
// и тем же цветом что IN_PROGRESS. На сервере (canonicalizeStatus) новые записи
// уже идут как IN_PROGRESS, но старые строки в БД остаются.
export const STATUS_LABELS: Record<DealStatusKey, string> = {
  NEW: "Новый",
  QUALIFIED: "В работе",
  PROPOSAL_SENT: "В работе",
  NEGOTIATING: "В работе",
  IN_PROGRESS: "В работе",
  WON: "Сделка",
  LOST: "Отказ",
};

export const STATUS_COLORS: Record<DealStatusKey, string> = {
  NEW: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  QUALIFIED: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  PROPOSAL_SENT: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  NEGOTIATING: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  IN_PROGRESS: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  WON: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  LOST: "bg-zinc-200 text-zinc-700 hover:bg-zinc-200",
};

// В UI пикера статусов показываем только 4 канонических значения.
// Legacy в этом массиве отсутствуют — мастер выбирает только из новых.
export const PICKABLE_STATUSES: DealStatusKey[] = ["NEW", "IN_PROGRESS", "WON", "LOST"];

export const SOURCE_LABELS: Record<ClientSourceKey, string> = {
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Рекомендация",
  SITE: "Сайт",
  KASPI: "Kaspi",
  OTHER: "Другое",
};

export const EVENT_LABELS: Record<EventTypeKey, string> = {
  NOTE: "Заметка",
  CALL: "Звонок",
  MEETING: "Встреча",
  WHATSAPP: "WhatsApp",
  MEASUREMENT: "Замер",
  INSTALL: "Монтаж",
  KP_CREATED: "Создано КП",
  KP_VIEWED: "КП просмотрено клиентом",
  KP_CONFIRMED: "КП подтверждено",
  KP_REJECTED: "КП отклонено",
  STATUS_CHANGE: "Изменение статуса",
  CONTRACT_CREATED: "Создан договор",
  CONTRACT_SIGNED: "Договор подписан клиентом",
  ACT_CREATED: "Создан акт выполненных работ",
  ACT_SIGNED: "Акт подписан клиентом",
  PHOTO_ADDED: "Добавлено фото",
};

export const MANUAL_EVENT_TYPES: { key: EventTypeKey; label: string }[] = [
  { key: "NOTE", label: "Заметка" },
  { key: "CALL", label: "Звонок" },
  { key: "MEETING", label: "Встреча" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "MEASUREMENT", label: "Замер" },
  { key: "INSTALL", label: "Монтаж" },
];
