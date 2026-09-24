import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import type { Metadata } from "next";

/**
 * Общая база потолков (Нариман, 24.09.2026): «чтобы мы видели все потолки,
 * софиты, могли смотреть общую базу для оптимизации работы».
 *
 * Считаем по всем живым замерам: какие комнаты и площади приносят мастера,
 * сколько на них света, насколько сложные контуры, что стоит в деньгах.
 * Всё одним SQL-проходом — 1900 комнат считать в приложении незачем.
 */

export const metadata: Metadata = { title: "База потолков — Админ" };
export const dynamic = "force-dynamic";

type Row = Record<string, string | number | null>;

function num(v: unknown): number {
  const n = typeof v === "bigint" ? Number(v) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

export default async function CeilingsBasePage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");
  const me = await prisma.master.findUnique({ where: { id: master.id }, select: { isOwner: true } });
  if (!me?.isOwner) redirect("/dashboard");

  const [totals, elements, spotBuckets, corners, canvas, moneyRows, monthly] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT
        (SELECT count(*) FROM "MeasurementObject" WHERE "deletedAt" IS NULL)          AS objects,
        (SELECT count(DISTINCT "masterId") FROM "MeasurementObject" WHERE "deletedAt" IS NULL) AS masters,
        count(*)                                                                       AS rooms,
        COALESCE(sum(r.area), 0)                                                       AS area_total,
        COALESCE(avg(NULLIF(r.area, 0)), 0)                                            AS area_avg,
        COALESCE(avg(NULLIF(r.perimeter, 0)), 0)                                       AS perimeter_avg,
        COALESCE(avg(jsonb_array_length(r.walls::jsonb)), 0)                            AS walls_avg
      FROM "MeasurementRoom" r
      JOIN "MeasurementObject" o ON o.id = r."objectId"
      WHERE o."deletedAt" IS NULL
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT e->>'type' AS type, count(*) AS cnt, count(DISTINCT r.id) AS rooms
      FROM "MeasurementRoom" r
      JOIN "MeasurementObject" o ON o.id = r."objectId"
      CROSS JOIN LATERAL jsonb_array_elements(r.elements::jsonb) e
      WHERE o."deletedAt" IS NULL
      GROUP BY 1 ORDER BY 2 DESC
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      WITH s AS (
        SELECT r.id, r.area,
          (SELECT count(*) FROM jsonb_array_elements(r.elements::jsonb) e WHERE e->>'type' = 'spot') AS spots
        FROM "MeasurementRoom" r
        JOIN "MeasurementObject" o ON o.id = r."objectId"
        WHERE o."deletedAt" IS NULL
      )
      SELECT CASE
          WHEN spots = 0 THEN 'без софитов'
          WHEN spots <= 4 THEN '1-4'
          WHEN spots <= 8 THEN '5-8'
          WHEN spots <= 12 THEN '9-12'
          ELSE '13 и больше'
        END AS bucket,
        count(*) AS rooms,
        COALESCE(avg(NULLIF(area, 0)), 0) AS area_avg,
        CASE WHEN sum(area) > 0 THEN sum(spots) / sum(area) ELSE 0 END AS per_m2
      FROM s GROUP BY 1
      ORDER BY min(spots)
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT jsonb_array_length(r.walls::jsonb) AS walls, count(*) AS rooms
      FROM "MeasurementRoom" r
      JOIN "MeasurementObject" o ON o.id = r."objectId"
      WHERE o."deletedAt" IS NULL AND jsonb_typeof(r.walls::jsonb) = 'array'
      GROUP BY 1 ORDER BY 1
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT COALESCE(e."recommendedVariant", 'не выбран') AS variant, count(*) AS cnt
      FROM "Estimate" e
      WHERE e."deletedAt" IS NULL
      GROUP BY 1 ORDER BY 2 DESC
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT
        count(*) AS kp,
        COALESCE(avg(NULLIF(total, 0)), 0) AS avg_total,
        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(total, 0)), 0) AS median_total,
        COALESCE(avg(CASE WHEN "totalArea" > 0 AND total > 0 THEN total / "totalArea" END), 0) AS avg_per_m2,
        count(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed
      FROM "Estimate" WHERE "deletedAt" IS NULL
    `),
    prisma.$queryRawUnsafe<Row[]>(`
      SELECT to_char(date_trunc('month', o."createdAt"), 'YYYY-MM') AS month,
             count(*) AS objects,
             COALESCE(sum(o."totalArea"), 0) AS area
      FROM "MeasurementObject" o
      WHERE o."deletedAt" IS NULL AND o."createdAt" > now() - interval '8 months'
      GROUP BY 1 ORDER BY 1 DESC
    `),
  ]);

  const t = totals[0] ?? {};
  const m = moneyRows[0] ?? {};
  const roomsTotal = num(t.rooms);
  const spotsTotal = num(elements.find((e) => e.type === "spot")?.cnt);
  const labels: Record<string, string> = {
    spot: "Софиты", chandelier: "Люстры", pendant: "Подвесы", curtain: "Гардины",
    subcurtain: "Подшторники", lightline: "Световые линии", track: "Треки",
    floating: "Парящий профиль", furniture: "Мебель", window: "Окна", door: "Двери",
    column: "Колонны", cutout: "Вырезы",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">База потолков</h1>
        <Link href="/dashboard/admin" className="text-sm text-muted-foreground hover:underline">
          ← Админ
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Всё, что мастера намеряли в приложении. Считается по живым замерам, без корзины.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Объектов", value: fmt(num(t.objects), 0) },
          { label: "Комнат", value: fmt(roomsTotal, 0) },
          { label: "Мастеров замеряли", value: fmt(num(t.masters), 0) },
          { label: "Площадь всего, м²", value: fmt(num(t.area_total), 0) },
          { label: "Средняя комната, м²", value: fmt(num(t.area_avg)) },
          { label: "Средний периметр, м", value: fmt(num(t.perimeter_avg)) },
          { label: "Стен в комнате", value: fmt(num(t.walls_avg)) },
          { label: "Софитов на комнату", value: roomsTotal ? fmt(spotsTotal / roomsTotal) : "0" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="text-xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Что ставят на потолок</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Элемент</th><th className="p-2">Штук</th><th className="p-2">В скольких комнатах</th><th className="p-2">Доля комнат</th></tr>
            </thead>
            <tbody>
              {elements.map((e) => (
                <tr key={String(e.type)} className="border-t">
                  <td className="p-2">{labels[String(e.type)] ?? String(e.type)}</td>
                  <td className="p-2">{fmt(num(e.cnt), 0)}</td>
                  <td className="p-2">{fmt(num(e.rooms), 0)}</td>
                  <td className="p-2">{roomsTotal ? fmt((num(e.rooms) / roomsTotal) * 100) : "0"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Сколько софитов в комнате</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Софитов</th><th className="p-2">Комнат</th><th className="p-2">Средняя площадь, м²</th><th className="p-2">Софитов на м²</th></tr>
            </thead>
            <tbody>
              {spotBuckets.map((b) => (
                <tr key={String(b.bucket)} className="border-t">
                  <td className="p-2">{String(b.bucket)}</td>
                  <td className="p-2">{fmt(num(b.rooms), 0)}</td>
                  <td className="p-2">{fmt(num(b.area_avg))}</td>
                  <td className="p-2">{fmt(num(b.per_m2), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Сложность контура</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Стен в комнате</th><th className="p-2">Комнат</th><th className="p-2">Доля</th></tr>
            </thead>
            <tbody>
              {corners.map((c) => (
                <tr key={String(c.walls)} className="border-t">
                  <td className="p-2">{String(c.walls)}</td>
                  <td className="p-2">{fmt(num(c.rooms), 0)}</td>
                  <td className="p-2">{roomsTotal ? fmt((num(c.rooms) / roomsTotal) * 100) : "0"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Деньги в КП</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "КП всего", value: fmt(num(m.kp), 0) },
            { label: "Принято клиентом", value: fmt(num(m.confirmed), 0) },
            { label: "Средний чек, ₸", value: fmt(num(m.avg_total), 0) },
            { label: "Медианный чек, ₸", value: fmt(num(m.median_total), 0) },
            { label: "Цена за м², ₸", value: fmt(num(m.avg_per_m2), 0) },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="text-xl font-semibold">{c.value}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Вариант в КП</th><th className="p-2">Сколько раз</th></tr>
            </thead>
            <tbody>
              {canvas.map((c) => (
                <tr key={String(c.variant)} className="border-t">
                  <td className="p-2">{String(c.variant)}</td>
                  <td className="p-2">{fmt(num(c.cnt), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">По месяцам</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Месяц</th><th className="p-2">Объектов</th><th className="p-2">Площадь, м²</th></tr>
            </thead>
            <tbody>
              {monthly.map((r) => (
                <tr key={String(r.month)} className="border-t">
                  <td className="p-2">{String(r.month)}</td>
                  <td className="p-2">{fmt(num(r.objects), 0)}</td>
                  <td className="p-2">{fmt(num(r.area), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
