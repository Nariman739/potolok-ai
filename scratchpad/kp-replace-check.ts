// Этап 2 (13.11.2026): «Клиент выбрал» новый вариант при уже принятом КП.
// ПИШЕТ В БАЗУ .env.local (прод) — только CTL-мастер, удаляет за собой по id.
//   npx tsx --env-file=.env.local scratchpad/kp-replace-check.ts http://localhost:3920
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

const [BASE] = process.argv.slice(2);
const stamp = String(Date.now()).slice(-6);
const created = { masters: [] as string[], objects: [] as string[], estimates: [] as string[], clients: [] as string[] };
const keep = setInterval(() => {}, 1000);
let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, info === undefined ? "" : JSON.stringify(info).slice(0, 300));
};
const api = async (cookie: string, path: string, init?: RequestInit) => {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie } });
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
const st = async (id: string) => prisma.estimate.findUnique({ where: { id }, select: { status: true, contractSignedAt: true, contractTextSnapshot: true } });
const sign = (pid: string) => fetch(`${BASE}/api/contract/${pid}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "CTL Клиент", agreed: true, lang: "ru" }) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));

(async () => {
  try {
    const phone = `+7999005${stamp.slice(0, 4)}`;
    const reg = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: `ctl-${stamp}`, firstName: "CTL", companyName: `CTL замена ${stamp}` }) });
    const A = reg.headers.get("set-cookie")?.split(";")[0];
    if (!reg.ok || !A) throw new Error(`register ${reg.status}`);
    const masterId = (await prisma.master.findUnique({ where: { phone }, select: { id: true } }))!.id;
    created.masters.push(masterId);
    const client = await prisma.client.create({ data: { masterId, name: `CTL клиент ${stamp}` } as never, select: { id: true } });
    created.clients.push(client.id);

    const newObj = async () => {
      const r = await api(A, "/measurements", { method: "POST", body: JSON.stringify({ address: `CTL замена ${stamp} — удалить`, status: "measured", rooms: [{ name: "Зал", walls: [400, 300, 400, 300], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 12, perimeter: 14, elements: [] }] }) });
      created.objects.push(r.j.id);
      return r.j.id as string;
    };
    const est = async (obj: string, status: string, total: number, extra: Record<string, unknown> = {}) => {
      const e = await prisma.estimate.create({ data: { masterId, measurementObjectId: obj, clientId: client.id, clientName: "CTL", roomsData: [], calculationData: {}, totalArea: 12, total, status, ...extra } as never, select: { id: true } });
      created.estimates.push(e.id);
      return e.id;
    };
    const contract = () => ({ contractPublicId: `ctl${randomBytes(8).toString("hex")}`, contractCreatedAt: new Date(), contractTextSnapshot: {} });

    // 1) Замена: старое CONFIRMED с НЕподписанным договором, новый вариант DRAFT → «Выбрал»
    const o1 = await newObj();
    const c1 = contract();
    const old1 = await est(o1, "CONFIRMED", 2_600_000, c1);
    const new1 = await est(o1, "DRAFT", 2_400_000);
    let r = await api(A, `/estimates/${new1}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    check("1 DRAFT → CONFIRMED при уже принятом КП: 200", r.status === 200 && r.j.status === "CONFIRMED", { s: r.status, e: r.j?.error });
    let s1 = await st(old1);
    check("1 прежнее → REVISED, договор помечен «заменён»", s1?.status === "REVISED" && (s1?.contractTextSnapshot as any)?.replacedByEstimateId === new1, s1?.status);
    r = await api(A, `/estimates/${old1}`);
    check("1 GET прежнего: contractReplaced=true", r.j.contractReplaced === true);
    const ev = await prisma.clientEvent.findFirst({ where: { clientId: client.id, type: "KP_CONFIRMED" }, orderBy: { createdAt: "desc" }, select: { content: true } });
    check("1 запись в ленте: «Мастер выбрал новый вариант … (было …)»", !!ev?.content?.startsWith("Мастер выбрал новый вариант") && ev.content.includes("было"), ev?.content);

    // 2) Публичная страница старого договора и подпись
    const html = await (await fetch(`${BASE}/contract/${c1.contractPublicId}`)).text();
    check("2 /contract: плашка «больше не действует»", html.includes("Этот договор больше не действует"));
    r = await sign(c1.contractPublicId);
    check("2 подпись заменённого договора → 409", r.status === 409 && r.j?.replaced === true, r);
    s1 = await st(old1);
    check("2 подписи нет", !s1?.contractSignedAt);

    // 3) Мастер вернулся к прежнему варианту (REVISED → CONFIRMED): пометка снята, новый → REVISED
    r = await api(A, `/estimates/${old1}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    s1 = await st(old1);
    const n1 = await st(new1);
    check("3 возврат к прежнему: оно CONFIRMED без пометки, новое REVISED", r.status === 200 && s1?.status === "CONFIRMED" && !(s1?.contractTextSnapshot as any)?.replacedByEstimateId && n1?.status === "REVISED", { s: r.status, old: s1?.status, nw: n1?.status });
    r = await sign(c1.contractPublicId);
    check("3 договор снова подписывается (200)", r.status === 200, r.status);

    // 4) Прежнее с ПОДПИСАННЫМ договором → выбрать новое нельзя, ничего не меняется
    const o2 = await newObj();
    const old2 = await est(o2, "CONFIRMED", 1_000_000, { ...contract(), contractSignedAt: new Date(), contractSignerName: "CTL" });
    const new2 = await est(o2, "SENT", 900_000);
    r = await api(A, `/estimates/${new2}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    check("4 подписан договор → 409 PREV_SIGNED, текст", r.status === 409 && r.j.code === "PREV_SIGNED" && String(r.j.error).startsWith("По прежнему КП клиент уже подписал договор") && String(r.j.error).includes("WhatsApp"), r.j);
    check("4 статусы не тронуты", (await st(old2))?.status === "CONFIRMED" && (await st(new2))?.status === "SENT");
    // акт
    const o2a = await newObj();
    await est(o2a, "CONFIRMED", 1_000_000, { actPublicId: `ctlact${randomBytes(6).toString("hex")}`, actSignedAt: new Date() });
    const new2a = await est(o2a, "SENT", 900_000);
    r = await api(A, `/estimates/${new2a}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    check("4 подписан акт → 409, текст про акт", r.status === 409 && String(r.j.error).includes("подписал акт"), r.j?.error);

    // 5) DRAFT без принятого в объекте — по-прежнему нельзя
    const o3 = await newObj();
    const d3 = await est(o3, "DRAFT", 500_000);
    r = await api(A, `/estimates/${d3}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    check("5 DRAFT без принятого → 400", r.status === 400, r.status);

    // 6) Прежнее без договора: обычная замена, SENT-варианты → REVISED как раньше
    const o4 = await newObj();
    const old4 = await est(o4, "CONFIRMED", 700_000);
    const sent4 = await est(o4, "SENT", 650_000);
    const new4 = await est(o4, "SENT", 600_000);
    r = await api(A, `/estimates/${new4}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) });
    check("6 без договора: прежнее и другой SENT → REVISED", r.status === 200 && (await st(old4))?.status === "REVISED" && (await st(sent4))?.status === "REVISED" && (await st(new4))?.status === "CONFIRMED");

    // 7) Гонка: клиент подписывает старый договор одновременно с выбором нового варианта
    let raceOk = 0, signWon = 0, pickWon = 0;
    const rounds = 6;
    for (let i = 0; i < rounds; i++) {
      const o = await newObj();
      const c = contract();
      const oldE = await est(o, "CONFIRMED", 1_000_000, c);
      const newE = await est(o, "SENT", 900_000);
      const [sg, pk] = await Promise.all([sign(c.contractPublicId), api(A, `/estimates/${newE}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) })]);
      const so = await st(oldE), sn = await st(newE);
      // Инвариант: либо подписан старый и он CONFIRMED, новый не выбран; либо старый REVISED без подписи, новый CONFIRMED
      const a = !!so?.contractSignedAt && so.status === "CONFIRMED" && sn?.status === "SENT" && pk.status === 409 && sg.status === 200;
      const b = !so?.contractSignedAt && so?.status === "REVISED" && sn?.status === "CONFIRMED" && pk.status === 200 && sg.status === 409;
      if (a) signWon++;
      if (b) pickWon++;
      if (a || b) raceOk++;
      else console.log("   гонка нарушена:", { sign: sg.status, pick: pk.status, old: so?.status, signed: !!so?.contractSignedAt, nw: sn?.status });
    }
    check(`7 гонка: ${rounds} раундов, инвариант держится (подпись первой ${signWon}, выбор первым ${pickWon})`, raceOk === rounds);

    // 8) Клиент сам «Принимает» по ссылке новый вариант при уже принятом прежнем (договор и акт НЕ подписаны)
    const pubConfirm = (pid: string) => fetch(`${BASE}/api/estimates/by-public/${pid}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(async (x) => ({ status: x.status, j: await x.json().catch(() => null) }));
    const pubOf = async (id: string) => (await prisma.estimate.findUnique({ where: { id }, select: { publicId: true } }))!.publicId;
    const o8 = await newObj();
    const act8 = `ctlact${randomBytes(6).toString("hex")}`;
    const c8 = contract();
    const old8 = await est(o8, "CONFIRMED", 800_000, { ...c8, actPublicId: act8, actCreatedAt: new Date() });
    const new8 = await est(o8, "SENT", 750_000);
    const evBefore = await prisma.clientEvent.count({ where: { clientId: client.id, type: "KP_CONFIRMED" } });
    r = await pubConfirm(await pubOf(new8));
    const s8 = await prisma.estimate.findUnique({ where: { id: old8 }, select: { status: true, contractTextSnapshot: true, actTextSnapshot: true } });
    check("8 по ссылке: новый CONFIRMED, прежний REVISED, договор и акт помечены", r.status === 200 && (await st(new8))?.status === "CONFIRMED" && s8?.status === "REVISED" && (s8?.contractTextSnapshot as any)?.replacedByEstimateId === new8 && (s8?.actTextSnapshot as any)?.replacedByEstimateId === new8, { s: r.status, old: s8?.status });
    const evAfter = await prisma.clientEvent.count({ where: { clientId: client.id, type: "KP_CONFIRMED" } });
    check("8 событие «принял КП» ровно одно", evAfter - evBefore === 1, evAfter - evBefore);
    const signAct = (pid: string) => fetch(`${BASE}/api/act/${pid}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "CTL Клиент", agreed: true }) }).then(async (x) => ({ status: x.status, j: await x.json().catch(() => null) }));
    r = await signAct(act8);
    check("8 подпись акта прежнего → 409 «акт больше не действует»", r.status === 409 && r.j?.replaced === true && String(r.j?.error).startsWith("Этот акт больше не действует"), r);
    const actHtml = await (await fetch(`${BASE}/act/${act8}`)).text();
    check("8 /act: плашка, формы подписи нет", actHtml.includes("Этот акт больше не действует"));
    r = await sign(c8.contractPublicId);
    check("8 подпись договора прежнего → 409", r.status === 409, r.status);

    // 9) По ссылке, но по прежнему подписан договор → «Свяжитесь с мастером.», ничего не меняется
    const o9 = await newObj();
    const old9 = await est(o9, "CONFIRMED", 900_000, { ...contract(), contractSignedAt: new Date(), contractSignerName: "CTL" });
    const new9 = await est(o9, "SENT", 850_000);
    const ev9 = await prisma.clientEvent.count({ where: { clientId: client.id, type: "KP_CONFIRMED" } });
    r = await pubConfirm(await pubOf(new9));
    check("9 по ссылке при подписанном прежнем → 409 «Свяжитесь с мастером.»", r.status === 409 && r.j?.error === "Свяжитесь с мастером.", r);
    check("9 статусы не тронуты, события нет", (await st(old9))?.status === "CONFIRMED" && (await st(new9))?.status === "SENT" && (await prisma.clientEvent.count({ where: { clientId: client.id, type: "KP_CONFIRMED" } })) === ev9);

    // 10) Гонка: клиент принимает B по ссылке, мастер в тот же миг выбирает A → ровно одно CONFIRMED
    let race2 = 0;
    for (let i = 0; i < 6; i++) {
      const o = await newObj();
      const oldE = await est(o, "CONFIRMED", 1_000_000, contract());
      const a10 = await est(o, "SENT", 950_000);
      const b10 = await est(o, "SENT", 900_000);
      const pidB = await pubOf(b10);
      await Promise.all([pubConfirm(pidB), api(A, `/estimates/${a10}`, { method: "PUT", body: JSON.stringify({ status: "CONFIRMED" }) })]);
      const all = await prisma.estimate.findMany({ where: { measurementObjectId: o }, select: { id: true, status: true } });
      const confirmed = all.filter((x) => x.status === "CONFIRMED");
      if (confirmed.length === 1 && (await st(oldE))?.status === "REVISED") race2++;
      else console.log("   гонка 2 нарушена:", all.map((x) => x.status));
    }
    check("10 гонка клиент-B против мастер-A: 6 раундов, ровно одно принятое", race2 === 6, race2);
  } catch (err) {
    fails++;
    console.log("ERROR", err);
  } finally {
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: created.clients } } });
    await prisma.estimate.deleteMany({ where: { id: { in: created.estimates } } });
    await prisma.measurementObject.deleteMany({ where: { id: { in: created.objects } } });
    await prisma.client.deleteMany({ where: { id: { in: created.clients } } });
    await prisma.member.deleteMany({ where: { masterId: { in: created.masters } } });
    await prisma.company.deleteMany({ where: { ownerId: { in: created.masters } } });
    await prisma.session.deleteMany({ where: { masterId: { in: created.masters } } }).catch(() => null);
    await prisma.master.deleteMany({ where: { id: { in: created.masters } } });
    console.log("CTL удалены:", JSON.stringify({ masters: created.masters, objects: created.objects.length, estimates: created.estimates.length, clients: created.clients.length }), "осталось мастеров:", await prisma.master.count({ where: { id: { in: created.masters } } }));
    console.log(fails ? `FAIL ${fails}` : "PASS");
    clearInterval(keep);
    process.exit(fails ? 1 : 0);
  }
})();
