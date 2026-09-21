import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getVertices, roomOutlinePath } from "@/lib/room-geometry";

/**
 * Наряд монтажнику (Этап 3, 20.09.2026). Открывается по ссылке из WhatsApp
 * без установки приложения: адрес, когда, что ставить по комнатам, чертёж,
 * сколько монтажник получит, кому звонить. Скидок, наценок и цены клиента
 * здесь нет — только то, что нужно на объекте.
 */

export const dynamic = "force-dynamic";

type RoomEl = { type?: string; length?: number };

function lightSummary(elements: unknown): string[] {
  if (!Array.isArray(elements) || elements.length === 0) return [];
  const els = elements as RoomEl[];
  const n = (t: string) => els.filter((e) => e?.type === t).length;
  const out: string[] = [];
  const spots = n("spot"); if (spots) out.push(`Софиты: ${spots} шт.`);
  const ch = n("chandelier") + n("pendant"); if (ch) out.push(`Люстра: ${ch} шт.`);
  const tr = els.filter((e) => e?.type === "track"); if (tr.length) out.push(`Трек: ${tr.length} шт.${tr[0]?.length ? ` · ${Math.round(tr.reduce((s, e) => s + (e.length ?? 0), 0) / 100 * 10) / 10} м` : ""}`);
  const ll = els.filter((e) => e?.type === "lightline"); if (ll.length) out.push(`Световая линия: ${ll.length} шт.${ll[0]?.length ? ` · ${Math.round(ll.reduce((s, e) => s + (e.length ?? 0), 0) / 100 * 10) / 10} м` : ""}`);
  const cu = n("curtain") + n("subcurtain") + n("builtin_gardina"); if (cu) out.push(`Гардина / подшторник: ${cu} шт.`);
  const fl = n("floating"); if (fl) out.push(`Парящий профиль: ${fl} участок${fl > 1 ? "а" : ""}`);
  return out;
}

function RoomSvg({ walls, angles, normalCorners, bulges, cornerRadii }: { walls: number[]; angles?: number[] | null; normalCorners?: boolean[] | null; bulges?: number[] | null; cornerRadii?: number[] | null }) {
  if (!Array.isArray(walls) || walls.length < 3) return null;
  const nc = Array.isArray(normalCorners) && normalCorners.length === walls.length ? normalCorners : walls.map(() => true);
  const ang = Array.isArray(angles) && angles.length === walls.length ? angles : undefined;
  let v: { x: number; y: number }[];
  try {
    v = getVertices(walls, nc, ang);
  } catch {
    return null;
  }
  const xs = v.map((p) => p.x), ys = v.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const size = 220, pad = 24;
  const scale = (size - pad * 2) / Math.max(w, h);
  const ox = pad + ((size - pad * 2) - w * scale) / 2 - minX * scale;
  const oy = pad + ((size - pad * 2) - h * scale) / 2 - minY * scale;
  const pts = v.map((p) => `${(p.x * scale + ox).toFixed(1)},${(p.y * scale + oy).toFixed(1)}`).join(" ");
  // Круглые стены и скруглённые углы монтажник должен видеть на чертеже: раньше
  // наряд рисовал любую комнату прямым многоугольником (21.09.2026).
  const outline = roomOutlinePath(
    v.map((p) => ({ x: p.x * scale + ox, y: p.y * scale + oy })),
    { bulges: bulges?.map((b) => (b || 0) * scale), cornerRadii: cornerRadii?.map((r) => (r || 0) * scale) },
  );
  // Подписи длин на серединах стен
  const labels = walls.map((len, i) => {
    const a = v[i], b = v[(i + 1) % v.length];
    return { x: ((a.x + b.x) / 2) * scale + ox, y: ((a.y + b.y) / 2) * scale + oy, len };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="bg-white rounded-lg border border-slate-200">
      {outline
        ? <path d={outline} fill="#eff6ff" stroke="#1e3a5f" strokeWidth={2} />
        : <polygon points={pts} fill="#eff6ff" stroke="#1e3a5f" strokeWidth={2} />}
      {labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} fontSize={11} textAnchor="middle" dominantBaseline="middle" fill="#334155"
          stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
          {l.len}
        </text>
      ))}
    </svg>
  );
}

export default async function WorkOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const obj = await prisma.measurementObject.findFirst({
    where: { workOrderToken: token, deletedAt: null },
    include: {
      rooms: { orderBy: { sortOrder: "asc" } },
      client: { select: { name: true, phone: true, address: true } },
      installer: { select: { name: true, phone: true } },
      master: { select: { firstName: true, lastName: true, phone: true, companyName: true, whatsappPhone: true } },
      workshopOrders: { orderBy: { sentAt: "desc" }, take: 1 },
    },
  });
  if (!obj) notFound();

  const company = obj.master.companyName || [obj.master.firstName, obj.master.lastName].filter(Boolean).join(" ");
  const masterPhone = obj.master.whatsappPhone || obj.master.phone;
  const when = obj.installAt
    ? obj.installAt.toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
  const totalArea = Math.round(obj.rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-500">Наряд на монтаж · {company}</p>
          <h1 className="text-2xl font-bold">{obj.address || obj.client?.name || "Объект"}</h1>
          {when && <p className="text-lg font-semibold text-orange-600">{when}</p>}
          <p className="text-slate-600">
            {obj.rooms.length} комн. · {totalArea} м²
            {obj.installer ? ` · монтаж: ${obj.installer.name}` : ""}
          </p>
        </header>

        <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-2">
          {obj.client?.name && <p><span className="text-slate-500">Заказчик:</span> {obj.client.name}</p>}
          {obj.client?.phone && (
            <p><span className="text-slate-500">Телефон заказчика:</span> <a className="text-blue-700 underline" href={`tel:${obj.client.phone}`}>{obj.client.phone}</a></p>
          )}
          {masterPhone && (
            <p><span className="text-slate-500">Вопросы:</span> <a className="text-blue-700 underline" href={`https://wa.me/${masterPhone.replace(/\D/g, "")}`}>{masterPhone}</a> ({company})</p>
          )}
          {obj.installerFee != null && (
            <p className="pt-1 text-lg"><span className="text-slate-500">За монтаж:</span> <b>{obj.installerFee.toLocaleString("ru-RU")} ₸</b></p>
          )}
          {obj.workshopOrders[0] && (
            <p className="text-sm text-slate-500">
              Полотно ушло в цех {obj.workshopOrders[0].sentAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty", day: "numeric", month: "long" })}
              {" "}· {obj.workshopOrders[0].roomsCount} комн.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Комнаты</h2>
          {obj.rooms.map((r, i) => {
            const lights = lightSummary(r.elements);
            return (
              <div key={r.id} className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row gap-4">
                <RoomSvg walls={r.walls as number[]} angles={r.angles as number[] | null} normalCorners={r.normalCorners as boolean[] | null} bulges={r.arcBulges as number[] | null} cornerRadii={r.cornerRadii as number[] | null} />
                <div className="flex-1 space-y-1">
                  <p className="font-semibold">{i + 1}. {r.name || "Комната"}</p>
                  <p className="text-slate-600">{r.area} м² · периметр {r.perimeter} м · {(r.walls as number[]).length} стен</p>
                  {lights.length > 0 ? (
                    <ul className="text-sm text-slate-800 list-disc pl-5">
                      {lights.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">Без света и доп. элементов</p>
                  )}
                  <p className="text-xs text-slate-400">Длины стен на чертеже — в см</p>
                </div>
              </div>
            );
          })}
        </section>

        <footer className="text-xs text-slate-400 pt-4">Potolok AI · наряд обновляется автоматически, ссылка постоянная</footer>
      </div>
    </main>
  );
}
