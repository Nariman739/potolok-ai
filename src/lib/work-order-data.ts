/**
 * Данные наряда монтажнику — одна модель для страницы /n/[token] и для PDF
 * (16.10.2026). Нариман: «чтобы можно было отправить монтажникам сам чертёж,
 * и они поняли, что делать и что с собой взять».
 */
import { prisma } from "@/lib/prisma";
import { asLang, tFor, localeOf, formatDocDate, type Lang } from "@/lib/i18n";
import "@/lib/i18n/work-order";
import { currencyFor } from "@/lib/company";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { summarizeMaterials, type MaterialLine } from "@/lib/object-materials";
import { pickPrimaryEstimate } from "@/lib/object-stage";
import type { CalculationResult } from "@/lib/types";
import { summarizeRoom, mergeSummaries, summaryLines, type PlanRoom } from "@/lib/work-order-plan";

const include = {
  rooms: { orderBy: { sortOrder: "asc" as const } },
  client: { select: { name: true, phone: true, address: true } },
  installer: { select: { name: true, phone: true } },
  master: { select: { firstName: true, lastName: true, phone: true, companyName: true, whatsappPhone: true, language: true } },
  workshopOrders: { orderBy: { sentAt: "desc" as const }, take: 1 },
  estimates: { where: { deletedAt: null }, select: { id: true, status: true, createdAt: true, deletedAt: true } },
};

export type WorkOrderObject = NonNullable<Awaited<ReturnType<typeof loadWorkOrderByToken>>>;

export async function loadWorkOrderByToken(token: string) {
  return prisma.measurementObject.findFirst({ where: { workOrderToken: token, deletedAt: null }, include });
}

export async function loadWorkOrderById(id: string, masterIds: string[]) {
  return prisma.measurementObject.findFirst({ where: { id, masterId: { in: masterIds }, deletedAt: null }, include });
}

export type WorkOrderRoom = {
  id: string;
  name: string;
  area: number;
  perimeter: number;
  wallsCount: number;
  plan: PlanRoom;
  lines: string[];
};

export type WorkOrderModel = {
  lang: Lang;
  currency: CurrencyCode;
  company: string;
  title: string;
  when: string | null;
  roomsCount: number;
  totalArea: number;
  installerName: string | null;
  clientName: string | null;
  clientPhone: string | null;
  masterPhone: string | null;
  fee: string | null;
  workshop: string | null;
  totals: string[];
  materials: MaterialLine[];
  rooms: WorkOrderRoom[];
};

const almaty = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Almaty" }));

export async function buildWorkOrderModel(obj: WorkOrderObject): Promise<WorkOrderModel> {
  const company = obj.master.companyName || [obj.master.firstName, obj.master.lastName].filter(Boolean).join(" ");
  // Язык наряда — язык мастера: наряд отправляет он и свою бригаду знает.
  const lang = asLang(obj.master.language);
  const t = tFor(lang);
  const currency = await currencyFor(obj.masterId);
  const when = obj.installAt
    ? `${formatDocDate(almaty(obj.installAt), lang)}, ${obj.installAt.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit" })}`
    : null;
  const totalArea = Math.round(obj.rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;

  const planRooms: PlanRoom[] = obj.rooms.map((r) => ({
    walls: (r.walls as number[]) ?? [],
    angles: r.angles as number[] | null,
    normalCorners: r.normalCorners as boolean[] | null,
    bulges: r.arcBulges as number[] | null,
    cornerRadii: r.cornerRadii as number[] | null,
    elements: r.elements,
    wallProfiles: r.wallProfiles,
  }));
  const summaries = planRooms.map(summarizeRoom);

  // «Взять с собой»: материалы по главному КП объекта (как «Взять на объект» в приложении)
  const primary = pickPrimaryEstimate(obj.estimates);
  const primaryCalc = primary
    ? await prisma.estimate.findUnique({ where: { id: primary.id }, select: { calculationData: true } })
    : null;
  const materials = summarizeMaterials(primaryCalc?.calculationData as CalculationResult | null)?.lines ?? [];

  const ws = obj.workshopOrders[0];
  return {
    lang,
    currency,
    company,
    title: obj.address || obj.client?.name || t("wo.object"),
    when,
    roomsCount: obj.rooms.length,
    totalArea,
    installerName: obj.installer?.name ?? null,
    clientName: obj.client?.name ?? null,
    clientPhone: obj.client?.phone ?? null,
    masterPhone: obj.master.whatsappPhone || obj.master.phone || null,
    fee: obj.installerFee != null ? formatMoney(obj.installerFee, currency, localeOf(lang)) : null,
    workshop: ws ? `${t("wo.toWorkshop", { date: formatDocDate(almaty(ws.sentAt), lang) })} · ${ws.roomsCount} ${t("wo.rooms")}` : null,
    totals: summaryLines(mergeSummaries(summaries), lang, { withWalls: false }),
    materials,
    rooms: obj.rooms.map((r, i) => ({
      id: r.id,
      name: r.name || t("wo.room"),
      area: r.area,
      perimeter: r.perimeter,
      wallsCount: ((r.walls as number[]) ?? []).length,
      plan: planRooms[i],
      lines: summaryLines(summaries[i], lang, { withWalls: true }),
    })),
  };
}
