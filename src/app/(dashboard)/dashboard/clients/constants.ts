export type DealStatusKey =
  | "NEW"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "NEGOTIATING"
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
  | "STATUS_CHANGE";

export const STATUS_LABELS: Record<DealStatusKey, string> = {
  NEW: "Новый",
  QUALIFIED: "Квалифицирован",
  PROPOSAL_SENT: "КП отправлено",
  NEGOTIATING: "Переговоры",
  WON: "Выигран",
  LOST: "Проиграл",
};

export const STATUS_COLORS: Record<DealStatusKey, string> = {
  NEW: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  QUALIFIED: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  PROPOSAL_SENT: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  NEGOTIATING: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  WON: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  LOST: "bg-zinc-200 text-zinc-700 hover:bg-zinc-200",
};

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
};

export const MANUAL_EVENT_TYPES: { key: EventTypeKey; label: string }[] = [
  { key: "NOTE", label: "Заметка" },
  { key: "CALL", label: "Звонок" },
  { key: "MEETING", label: "Встреча" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "MEASUREMENT", label: "Замер" },
  { key: "INSTALL", label: "Монтаж" },
];
