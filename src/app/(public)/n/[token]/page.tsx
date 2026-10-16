import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { asLang, tFor, localeOf, formatDocDate } from "@/lib/i18n";
import { RoomPlanSvg, summarizeRoom, mergeSummaries, summaryLines } from "@/lib/work-order-plan";
import { currencyFor } from "@/lib/company";
import { formatMoney } from "@/lib/currency";
import "@/lib/i18n/work-order";

/**
 * Наряд монтажнику (Этап 3, 20.09.2026). Открывается по ссылке из WhatsApp
 * без установки приложения: адрес, когда, что ставить по комнатам, чертёж,
 * сколько монтажник получит, кому звонить. Скидок, наценок и цены клиента
 * здесь нет — только то, что нужно на объекте.
 */

// Ссылки на эти страницы уходят клиенту в WhatsApp и живут вечно: если такую
// перешлют в общий чат или выложат в отзыв, поисковик проиндексирует имя,
// телефон, адрес заказчика и сумму сделки. Закрываем от индексации
// (аудит 24.09.2026).
export const robots = { index: false, follow: false };

export const dynamic = "force-dynamic";

// План с элементами и сводка — src/lib/work-order-plan.tsx (16.10.2026): монтажник
// видит на чертеже, где софиты, люстры, треки, гардины и какой профиль на стене.

export default async function WorkOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const obj = await prisma.measurementObject.findFirst({
    where: { workOrderToken: token, deletedAt: null },
    include: {
      rooms: { orderBy: { sortOrder: "asc" } },
      client: { select: { name: true, phone: true, address: true } },
      installer: { select: { name: true, phone: true } },
      master: { select: { firstName: true, lastName: true, phone: true, companyName: true, whatsappPhone: true, language: true } },
      workshopOrders: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });
  if (!obj) notFound();

  const company = obj.master.companyName || [obj.master.firstName, obj.master.lastName].filter(Boolean).join(" ");
  // Язык наряда — язык мастера: наряд отправляет он и свою бригаду знает.
  const lang = asLang(obj.master.language);
  const t = tFor(lang);
  const masterPhone = obj.master.whatsappPhone || obj.master.phone;
  // Валюта — владельца компании, как цены (07.10.2026)
  const currency = await currencyFor(obj.masterId);
  const when = obj.installAt
    ? `${formatDocDate(new Date(obj.installAt.toLocaleString("en-US", { timeZone: "Asia/Almaty" })), lang)}, ${obj.installAt.toLocaleString(localeOf(lang), { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit" })}`
    : null;
  const totalArea = Math.round(obj.rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const planRooms = obj.rooms.map((r) => ({
    walls: (r.walls as number[]) ?? [],
    angles: r.angles as number[] | null,
    normalCorners: r.normalCorners as boolean[] | null,
    bulges: r.arcBulges as number[] | null,
    cornerRadii: r.cornerRadii as number[] | null,
    elements: r.elements,
    wallProfiles: r.wallProfiles,
  }));
  const roomSummaries = planRooms.map(summarizeRoom);
  // Итог по объекту — монтажник считает материал и свет одним взглядом.
  const totals = summaryLines(mergeSummaries(roomSummaries), lang, { withWalls: false });

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">{t("wo.title")} · {company}</p>
          <h1 className="text-2xl font-bold">{obj.address || obj.client?.name || t("wo.object")}</h1>
          {when && <p className="text-lg font-semibold text-orange-600">{when}</p>}
          <p className="text-slate-600">
            {obj.rooms.length} {t("wo.rooms")} · {totalArea} м²
            {obj.installer ? ` · ${t("wo.install")}: ${obj.installer.name}` : ""}
          </p>
        </header>

        <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
          {obj.client?.name && <p><span className="text-slate-500">{t("wo.client")}:</span> {obj.client.name}</p>}
          {obj.client?.phone && (
            <p><span className="text-slate-500">{t("wo.clientPhone")}:</span> <a className="text-blue-700 underline" href={`tel:${obj.client.phone}`}>{obj.client.phone}</a></p>
          )}
          {masterPhone && (
            <p><span className="text-slate-500">{t("wo.questions")}:</span> <a className="text-blue-700 underline" href={`https://wa.me/${masterPhone.replace(/\D/g, "")}`}>{masterPhone}</a> ({company})</p>
          )}
          {obj.installerFee != null && (
            <p className="pt-1 text-lg"><span className="text-slate-500">{t("wo.fee")}:</span> <b>{formatMoney(obj.installerFee, currency, localeOf(lang))}</b></p>
          )}
          {obj.workshopOrders[0] && (
            <p className="text-sm text-slate-500">
              {t("wo.toWorkshop", { date: formatDocDate(new Date(obj.workshopOrders[0].sentAt.toLocaleString("en-US", { timeZone: "Asia/Almaty" })), lang) })}
              {" "}· {obj.workshopOrders[0].roomsCount} {t("wo.rooms")}
            </p>
          )}
        </section>

        {totals.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-2">{t("wo.totalsTitle")}</h2>
            <ul className="text-sm text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {totals.map((l) => <li key={l}>• {l}</li>)}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("wo.roomsTitle")}</h2>
          <p className="text-xs text-slate-500 -mt-1">{t("wo.planHint")}</p>
          {obj.rooms.map((r, i) => {
            const lines = summaryLines(roomSummaries[i], lang, { withWalls: true });
            return (
              <div key={r.id} className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row gap-4">
                <RoomPlanSvg room={planRooms[i]} lang={lang} />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">{i + 1}. {r.name || t("wo.room")}</p>
                  <p className="text-slate-600">{r.area} м² · {t("wo.perimeter")} {r.perimeter} м · {(r.walls as number[]).length} {t("wo.walls")}</p>
                  {lines.length > 0 ? (
                    <ul className="text-sm text-slate-800 list-disc pl-5">
                      {lines.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">{t("wo.noLights")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <footer className="text-xs text-slate-400 pt-4">{t("wo.footer")}</footer>
      </div>
    </main>
  );
}
