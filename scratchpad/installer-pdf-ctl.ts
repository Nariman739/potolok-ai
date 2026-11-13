// Кадры «КП монтажнику» на CTL (как КП живого аудитора 13.11): мобильное КП с installerItems
// и допами; затем наряд процентом; плюс КП «с сайта». ПИШЕТ В БАЗУ .env.local (прод) — только
// CTL, удаляет по id.
//   npx tsx --env-file=.env.local scratchpad/installer-pdf-ctl.ts http://localhost:3920 <outdir>
import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";

const [BASE, OUT] = process.argv.slice(2);
const stamp = String(Date.now()).slice(-6);
const created = { masters: [] as string[], objects: [] as string[], estimates: [] as string[] };
const keep = setInterval(() => {}, 1000);
let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, info === undefined ? "" : JSON.stringify(info).slice(0, 300));
};
const api = async (cookie: string, path: string, init?: RequestInit) => {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie } });
  return r;
};
const ii = (itemCode: string, itemName: string, quantity: number, unit: string, unitPrice: number) => ({ itemCode, itemName, quantity, unit, unitPrice, total: quantity * unitPrice });

// КП из приложения: 13 м², софиты разных типов, своя позиция, пара, гардина с подсветкой, 2 допа
const MOBILE_CALC = {
  totalArea: 13, totalSpots: 0, total: 150000,
  roomResults: [{
    roomId: "r1", roomName: "Зал", area: 13,
    items: [
      ii("canvas_mat", "Полотно (до 3,2 м)", 13, "м²", 3500),
      ii("profile_plastic", "Профиль пластиковый", 14.6, "м.п.", 1000),
      ii("spot_ours", "Софиты GX53 с установкой", 2, "шт.", 4000),
      ii("spot_bh53", "Софит BH53 с установкой", 1, "шт.", 6000),
      ii("spot_bh10", "Софит BH10 с установкой", 1, "шт.", 6000),
      ii("spot:v:ctl", "Софит мастера «Трек-мини»", 3, "шт.", 5000),
      ii("spot_client", "Софиты клиентские (установка)", 1, "шт.", 2000),
      ii("spot_pair_client", "Двойные софиты клиентские", 1, "пара", 4000),
      ii("chandelier", "Закладная + установка люстры", 1, "шт.", 5000),
      ii("gardina_led", "Гардина с подсветкой", 3, "м.п.", 9000),
    ],
    installerItems: [
      ii("canvas_mat", "Монтаж полотна", 13, "м²", 800),
      ii("profile_plastic", "Монтаж профиля", 14.6, "м.п.", 300),
      ii("spot_ours", "Монтаж софита GX53", 2, "шт.", 1050),
      ii("spot_bh53", "Монтаж софита BH53", 1, "шт.", 2100),
      ii("spot_bh10", "Монтаж софита BH10", 1, "шт.", 2100),
      ii("spot:v:ctl", "Монтаж софита «Трек-мини»", 3, "шт.", 1500),
      ii("spot_client", "Установка клиентского софита", 1, "шт.", 1000),
      ii("spot_pair_client", "Монтаж пары софитов", 1, "пара", 2000),
      ii("chandelier", "Закладная + установка люстры", 1, "шт.", 3000),
      ii("gardina_led", "Монтаж гардины с подсветкой", 3, "м.п.", 2500),
    ],
  }],
  extraItems: [
    { ...ii("extra_1", "Демонтаж старого потолка", 13, "м²", 1000), installerPrice: 300 },
    { ...ii("own_x", "Выезд за город", 1, "усл.", 5000), installerPrice: 1500 },
  ],
};
const MOBILE_TOTAL = Math.round(13 * 800 + 14.6 * 300 + 2 * 1050 + 2100 + 2100 + 3 * 1500 + 1000 + 2000 + 3000 + 3 * 2500 + 13 * 300 + 1500);

async function pdfText(cookie: string, est: string, name: string) {
  const r = await api(cookie, `/estimates/${est}/installer-pdf`);
  const buf = Buffer.from(await r.arrayBuffer());
  const f = `${OUT}/${name}.pdf`;
  writeFileSync(f, buf);
  const { execFileSync } = await import("child_process");
  execFileSync("pdftoppm", ["-png", "-r", "80", "-f", "1", "-l", "1", f, `${OUT}/${name}`]);
  return { status: r.status, text: execFileSync("pdftotext", ["-layout", f, "-"]).toString() };
}

(async () => {
  try {
    const phone = `+7999004${stamp.slice(0, 4)}`;
    const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: `ctl-${stamp}`, firstName: "CTL", companyName: `CTL наряд-PDF ${stamp}` }) });
    const A = reg.headers.get("set-cookie")?.split(";")[0];
    if (!reg.ok || !A) throw new Error(`register ${reg.status}`);
    const masterId = (await prisma.master.findUnique({ where: { phone }, select: { id: true } }))!.id;
    created.masters.push(masterId);

    const objR = await (await api(A, "/measurements", { method: "POST", body: JSON.stringify({ address: `CTL наряд-PDF ${stamp} — удалить`, status: "measured", rooms: [{ name: "Зал", walls: [400, 325, 400, 325], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 13, perimeter: 14.5, elements: [] }] }) })).json();
    created.objects.push(objR.id);
    const est = await prisma.estimate.create({ data: { masterId, measurementObjectId: objR.id, clientName: "CTL Аудит", roomsData: [], calculationData: MOBILE_CALC, totalArea: 13, total: 150000, status: "CONFIRMED" } as never, select: { id: true } });
    created.estimates.push(est.id);

    // 1) Наряда нет — авто-строки, как вкладка «Монтажнику»
    let p = await pdfText(A, est.id, "01-mobile-auto");
    const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
    check("1 PDF 200", p.status === 200, p.status);
    check(`1 итог ${fmt(MOBILE_TOTAL)} (= вкладка)`, p.text.replace(/\s/g, "").includes(fmt(MOBILE_TOTAL).replace(/\s/g, "") + "₽"), MOBILE_TOTAL);
    for (const s of ["Трек-мини", "пары софитов", "гардины с подсветкой", "Демонтаж старого", "Выезд за город", "Дополнительно", "Светильников: 9"]) check(`1 есть «${s}»`, p.text.includes(s));
    check("1 ставки приложения: BH53 2 100, GX53 1 050", /BH53[^\n]*2\s100/.test(p.text) && /GX53[^\n]*1\s050/.test(p.text));

    // наряд «По работам» — тот же итог
    const wo = await (await api(A, `/objects/${objR.id}/work-order`)).json();
    check("1 наряд «По работам» = PDF", wo.total === MOBILE_TOTAL, wo.total);

    // 2) Мастер поправил наряд — PDF печатает правки
    const edited = wo.lines.map((l: { key: string; price: number }) => (l.key.includes("canvas") ? { ...l, price: 900 } : l));
    await api(A, `/objects/${objR.id}/work-order`, { method: "PUT", body: JSON.stringify({ lines: edited }) });
    p = await pdfText(A, est.id, "02-mobile-edited");
    check("2 правка ставки полотна 900 в PDF", /полотна[^\n]*900/.test(p.text) && p.text.replace(/\s/g, "").includes(fmt(MOBILE_TOTAL + 1300).replace(/\s/g, "") + "₽"), MOBILE_TOTAL + 1300);

    // 3) Наряд процентом — одна строка без базы
    const pr = await (await api(A, `/objects/${objR.id}/work-order`, { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [] }) })).json();
    p = await pdfText(A, est.id, "03-percent");
    check("3 «Оплата: 30 % от суммы заказа» и 45 000", p.text.includes("Оплата: 30 % от суммы заказа") && p.text.replace(/\s/g, "").includes("45000₽") && pr.total === 45000, pr.total);
    check("3 база КП (150 000) не видна, светильники в шапке", !p.text.replace(/\s/g, "").includes("150000") && p.text.includes("Светильников: 9"));

    // 4) Наряд сохранён от ДРУГОГО КП — этому КП авто-строки
    const est2 = await prisma.estimate.create({ data: { masterId, measurementObjectId: objR.id, clientName: "CTL Сайт", roomsData: [], totalArea: 13, total: 90000, status: "DRAFT", calculationData: { totalArea: 13, totalSpots: 4, roomResults: [{ roomName: "Спальня", area: 13, items: [ii("canvas_mat", "Полотно", 13, "м²", 3500), ii("spot_ours", "Софиты GX53", 4, "шт.", 4000)] }], extraItems: [{ ...ii("x", "Доп с монтажом", 1, "шт.", 3000), installerPrice: 900 }] } } as never, select: { id: true } });
    created.estimates.push(est2.id);
    p = await pdfText(A, est2.id, "04-site-auto");
    check("4 КП с сайта: допы на месте, не процент", p.text.includes("Доп с монтажом") && !p.text.includes("Оплата:") && p.text.includes("Светильников: 4"));
  } catch (err) {
    fails++;
    console.log("ERROR", err);
  } finally {
    await prisma.estimate.deleteMany({ where: { id: { in: created.estimates } } });
    await prisma.measurementObject.deleteMany({ where: { id: { in: created.objects } } });
    await prisma.member.deleteMany({ where: { masterId: { in: created.masters } } });
    await prisma.company.deleteMany({ where: { ownerId: { in: created.masters } } });
    await prisma.session.deleteMany({ where: { masterId: { in: created.masters } } }).catch(() => null);
    await prisma.master.deleteMany({ where: { id: { in: created.masters } } });
    console.log("CTL удалены:", JSON.stringify(created), "осталось мастеров:", await prisma.master.count({ where: { id: { in: created.masters } } }));
    console.log(fails ? `FAIL ${fails}` : "PASS");
    clearInterval(keep);
    process.exit(fails ? 1 : 0);
  }
})();
