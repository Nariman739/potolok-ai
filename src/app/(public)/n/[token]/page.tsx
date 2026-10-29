import { notFound } from "next/navigation";
import { tFor } from "@/lib/i18n";
import "@/lib/i18n/work-order";
import { RoomPlanSvg } from "@/lib/work-order-plan";
import { loadWorkOrderByToken, buildWorkOrderModel } from "@/lib/work-order-data";

/**
 * Наряд монтажнику (Этап 3, 20.09.2026). Открывается по ссылке из WhatsApp
 * без установки приложения: адрес, когда, что ставить по комнатам, чертёж,
 * сколько монтажник получит, кому звонить. Скидок, наценок и цены клиента
 * здесь нет — только то, что нужно на объекте.
 *
 * С 16.10.2026 на чертеже — расстановка софитов, люстр, треков, гардин и
 * профили стен (src/lib/work-order-plan.tsx), блоки «Итого по объекту» и
 * «Взять с собой», и тот же наряд можно скачать PDF-файлом. Данные общие с
 * PDF — src/lib/work-order-data.ts.
 */

// Ссылки на эти страницы уходят клиенту в WhatsApp и живут вечно: если такую
// перешлют в общий чат или выложат в отзыв, поисковик проиндексирует имя,
// телефон, адрес заказчика и сумму сделки. Закрываем от индексации
// (аудит 24.09.2026).
export const robots = { index: false, follow: false };

export const dynamic = "force-dynamic";

export default async function WorkOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const obj = await loadWorkOrderByToken(token);
  if (!obj) notFound();
  const m = await buildWorkOrderModel(obj);
  const t = tFor(m.lang);
  const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">{t("wo.title")} · {m.company}</p>
          <h1 className="text-2xl font-bold">{m.title}</h1>
          {m.when && <p className="text-lg font-semibold text-orange-600">{m.when}</p>}
          <p className="text-slate-600">
            {m.roomsCount} {t("wo.rooms")} · {m.totalArea} м²
            {m.installerName ? ` · ${t("wo.install")}: ${m.installerName}` : ""}
          </p>
          <a
            href={`/api/work-order/${token}/pdf`}
            className="inline-flex items-center gap-2 mt-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold px-4 py-2.5"
          >
            ⤓ {t("wo.downloadPdf")}
          </a>
        </header>

        <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
          {m.clientName && <p><span className="text-slate-500">{t("wo.client")}:</span> {m.clientName}</p>}
          {m.clientPhone && (
            <p><span className="text-slate-500">{t("wo.clientPhone")}:</span> <a className="text-blue-700 underline" href={`tel:${m.clientPhone}`}>{m.clientPhone}</a></p>
          )}
          {m.masterPhone && (
            <p><span className="text-slate-500">{t("wo.questions")}:</span> <a className="text-blue-700 underline" href={`https://wa.me/${m.masterPhone.replace(/\D/g, "")}`}>{m.masterPhone}</a> ({m.company})</p>
          )}
          {m.fee && (
            <p className="pt-1 text-lg"><span className="text-slate-500">{t("wo.fee")}:</span> <b>{m.fee}</b></p>
          )}
          {m.workshop && <p className="text-sm text-slate-500">{m.workshop}</p>}
        </section>

        {/* За что платят — построчно, как мастер проверил в приложении (29.10.2026) */}
        {m.payLines.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-2">{t("wo.payTitle")}</h2>
            <table className="w-full text-sm">
              <tbody>
                {m.payLines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 pr-2">
                      {l.name}
                      {l.room && <span className="block text-xs text-slate-400">{l.room}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-500 whitespace-nowrap">{l.qty} {l.unit} × {l.price}</td>
                    <td className="py-1.5 text-right font-semibold whitespace-nowrap">{l.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-2 font-semibold" colSpan={2}>{t("wo.payTotal")}</td>
                  <td className="pt-2 text-right text-lg font-bold whitespace-nowrap">{m.fee}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {m.totals.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-2">{t("wo.totalsTitle")}</h2>
            <ul className="text-sm text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {m.totals.map((l) => <li key={l}>• {l}</li>)}
            </ul>
          </section>
        )}

        {m.materials.length > 0 && (
          <section className="rounded-xl bg-white border border-slate-200 p-4">
            <h2 className="text-lg font-semibold mb-2">{t("wo.materialsTitle")}</h2>
            <ul className="text-sm text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {m.materials.map((l) => <li key={l.code}>• {l.name} — {qty(l.quantity)} {l.unit}</li>)}
            </ul>
            <p className="text-xs text-slate-400 mt-2">{t("wo.materialsHint")}</p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("wo.roomsTitle")}</h2>
          <p className="text-xs text-slate-500 -mt-1">{t("wo.planHint")}</p>
          {m.rooms.map((r, i) => (
            <div key={r.id} className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row gap-4">
              <RoomPlanSvg room={r.plan} lang={m.lang} />
              <div className="flex-1 space-y-1">
                <p className="font-semibold">{i + 1}. {r.name}</p>
                <p className="text-slate-600">{r.area} м² · {t("wo.perimeter")} {r.perimeter} м · {r.wallsCount} {t("wo.walls")}</p>
                {r.lines.length > 0 ? (
                  <ul className="text-sm text-slate-800 list-disc pl-5">
                    {r.lines.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">{t("wo.noLights")}</p>
                )}
              </div>
            </div>
          ))}
        </section>

        <footer className="text-xs text-slate-400 pt-4">{t("wo.footer")}</footer>
      </div>
    </main>
  );
}
