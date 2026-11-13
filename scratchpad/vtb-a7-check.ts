// Аудит А7 ВТБ (13.11.2026) — стенд без реальных платежей.
// Весь исходящий fetch подменён: шлюз банка, Telegram, Meta, пуши Expo, Upstash —
// наружу не уходит НИЧЕГО (неизвестный адрес → исключение). БД — CTL-мастер, удаление по id.
//   npx tsx --env-file=.env.local scratchpad/vtb-a7-check.ts
import { randomBytes } from "crypto";

// ── окружение до импорта модулей ──
process.env.VTB_ENABLED = "true";
process.env.VTB_TEST_API_USER = "t-user"; process.env.VTB_TEST_PASSWORD = "t-pass"; process.env.VTB_TEST_GATEWAY = "https://gw-test.local/payment/rest";
process.env.VTB_API_USER = "p-user"; process.env.VTB_PASSWORD = "p-pass"; process.env.VTB_GATEWAY = "https://gw-prod.local/payment/rest";
process.env.ADMIN_TG_CHAT_ID = "ctl-admin-chat";
process.env.TELEGRAM_BOT_TOKEN = "ctl-bot-token";
process.env.META_CAPI_TOKEN = "ctl-meta";
process.env.UPSTASH_REDIS_REST_URL = "https://upstash.local";
process.env.UPSTASH_REDIS_REST_TOKEN = "ctl";
delete process.env.VTB_TEST_MASTER_IDS;

// ── подменённый fetch ──
type Gw = { orderStatus: number; amount: number; currency: string; orderNumber: string };
const gwOrders = new Map<string, Gw>(); // mdOrder → состояние
const calls = { gateway: 0, telegram: 0, meta: 0, expo: 0, other: [] as string[] };
const redis = new Map<string, { n: number; exp: number }>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (url.includes("gw-test.local") || url.includes("gw-prod.local")) {
    calls.gateway++;
    const p = new URLSearchParams(String(init?.body ?? ""));
    const by = p.get("orderId") ?? [...gwOrders.entries()].find(([, v]) => v.orderNumber === p.get("orderNumber"))?.[0];
    const st = by ? gwOrders.get(by) : undefined;
    if (!st) return json({ errorCode: "6", errorMessage: "нет заказа" });
    return json({ errorCode: "0", orderNumber: st.orderNumber, orderStatus: st.orderStatus, amount: st.amount, currency: st.currency, actionCode: 0 });
  }
  if (url.includes("api.telegram.org")) { calls.telegram++; return json({ ok: true, result: {} }); }
  if (url.includes("graph.facebook.com")) { calls.meta++; return json({}); }
  if (url.includes("exp.host") || url.includes("expo.dev")) { calls.expo++; return json({ data: [] }); }
  if (url.startsWith("https://upstash.local")) {
    // Минимальный REST Upstash: pipeline [incr, pttl] и pexpire
    const body = JSON.parse(String(init?.body ?? "[]"));
    const now = Date.now();
    const get = (k: string) => { const v = redis.get(k); if (!v || (v.exp && v.exp < now)) { redis.delete(k); return null; } return v; };
    const run = (cmd: (string | number)[]) => {
      const [op, key, arg] = [String(cmd[0]).toLowerCase(), String(cmd[1]), cmd[2]];
      if (op === "incr") { const v = get(key) ?? { n: 0, exp: 0 }; v.n++; redis.set(key, v); return v.n; }
      if (op === "pttl") { const v = get(key); return !v ? -2 : v.exp ? v.exp - now : -1; }
      if (op === "pexpire") { const v = get(key); if (v) v.exp = now + Number(arg); return v ? 1 : 0; }
      return null;
    };
    if (url.endsWith("/pipeline") || url.includes("/pipeline")) return json((body as (string | number)[][]).map((c) => ({ result: run(c) })));
    return json({ result: run(body as (string | number)[]) });
  }
  calls.other.push(url);
  throw new Error(`стенд: исходящий запрос запрещён: ${url}`);
}) as typeof fetch;

let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, info === undefined ? "" : JSON.stringify(info).slice(0, 220));
};
const keep = setInterval(() => {}, 1000);

(async () => {
  const { prisma } = await import("@/lib/prisma");
  const created = { masters: [] as string[], payments: [] as string[] };
  try {
    // 1) Матрица режима: getVtbConfig читает env при каждом вызове
    const vtb = await import("@/lib/vtb");
    const { isCronAuthorized } = await import("@/lib/cron-auth");
    const mode = (v: string | undefined) => { if (v === undefined) delete process.env.VTB_MODE; else process.env.VTB_MODE = v; return vtb.getVtbConfig(); };
    check("1 VTB_MODE пусто → выключено", mode(undefined) === null);
    check("1 VTB_MODE=Prod → выключено", mode("Prod") === null);
    check("1 VTB_MODE=production → выключено", mode("production") === null);
    check("1 VTB_MODE=test → тест", mode("test")?.test === true);
    check("1 VTB_MODE=prod → боевой", mode("prod")?.test === false);
    const pu = process.env.VTB_API_USER; delete process.env.VTB_API_USER;
    check("1 VTB_MODE=prod без ключей → выключено", mode("prod") === null);
    process.env.VTB_API_USER = pu;
    process.env.VTB_ENABLED = "false";
    check("1 VTB_ENABLED=false → выключено при любом режиме", mode("prod") === null);
    process.env.VTB_ENABLED = "true";

    // CTL-мастер (не QA)
    const stamp = String(Date.now()).slice(-6);
    const m = await prisma.master.create({ data: { phone: `+7999006${stamp.slice(0, 4)}`, passwordHash: "x", firstName: "CTL ВТБ" } as never, select: { id: true, phone: true, paidUntil: true } });
    created.masters.push(m.id);
    check("2 песочница: не-QA мастер → тест недоступен", (mode("test"), !vtb.vtbTestAllowed(m) && !vtb.vtbAvailableFor(m)));
    process.env.VTB_TEST_MASTER_IDS = `x, ${m.id}`;
    check("2 песочница: мастер из VTB_TEST_MASTER_IDS → доступен", vtb.vtbTestAllowed(m) && vtb.vtbAvailableFor(m));
    check("2 QA-телефон из src/lib/qa.ts → доступен", vtb.vtbTestAllowed({ id: "?", phone: "+79990000077" }) && vtb.vtbTestAllowed({ id: "?", phone: "+77000000077" }));
    delete process.env.VTB_TEST_MASTER_IDS;
    check("2 боевой режим — всем", (mode("prod"), vtb.vtbAvailableFor(m)));

    const newPayment = async (test: boolean, amount = 5000) => {
      const p = await prisma.pendingPayment.create({ data: { masterId: m.id, amount, currency: "KZT", activatedDays: 30, comment: test ? vtb.VTB_TEST_COMMENT : vtb.VTB_COMMENT } as never, select: { id: true } });
      created.payments.push(p.id);
      const md = `md-${randomBytes(6).toString("hex")}`;
      gwOrders.set(md, { orderStatus: 2, amount: amount * 100, currency: "398", orderNumber: p.id });
      return { id: p.id, md };
    };
    const paidUntil = async () => (await prisma.master.findUnique({ where: { id: m.id }, select: { paidUntil: true } }))!.paidUntil;

    // 3) Песочница: оплата «2» → PRO нет, заявка REJECTED с пометкой, одно сообщение владельцу, Meta нет
    mode("test");
    const before3 = await paidUntil();
    const t3 = await newPayment(true);
    const tg0 = calls.telegram, meta0 = calls.meta;
    const r3 = await vtb.settleVtbPayment(t3.id);
    const r3b = await vtb.settleVtbPayment(t3.id);
    const p3 = await prisma.pendingPayment.findUnique({ where: { id: t3.id }, select: { status: true, reviewNotes: true } });
    check("3 тест: settle → ok:false test:true", !r3.ok && (r3 as any).test === true, r3);
    check("3 тест: paidUntil не изменился", String(await paidUntil()) === String(before3));
    check("3 тест: заявка REJECTED «ВТБ ТЕСТ…»", p3?.status === "REJECTED" && !!p3.reviewNotes?.startsWith("ВТБ ТЕСТ"), p3);
    check("3 тест: владельцу одно сообщение (повторный settle — без второго), Meta не трогали", calls.telegram - tg0 === 1 && calls.meta === meta0 && !r3b.ok, { tg: calls.telegram - tg0, meta: calls.meta - meta0 });

    // 6) Режим заявки ≠ режиму оплаты
    mode("prod");
    const t6 = await newPayment(true);
    const r6 = await vtb.settleVtbPayment(t6.id);
    check("6 тестовая заявка при боевом конфиге → не зачисляется", !r6.ok && /режим/.test((r6 as any).reason), r6);
    mode("test");
    const p6 = await newPayment(false);
    const r6b = await vtb.settleVtbPayment(p6.id);
    check("6 боевая заявка при тестовом конфиге → не зачисляется", !r6b.ok && /режим/.test((r6b as any).reason), r6b);

    // 4) Боевой: 5 параллельных callback + settle (confirm/крон) → +30 дней ровно один раз
    mode("prod");
    const { POST: callbackPOST } = await import("@/app/api/payment/vtb/callback/route");
    const cb = (md: string, ip = "203.0.113.10") => callbackPOST(new Request("https://potolok.ai/api/payment/vtb/callback", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip }, body: `mdOrder=${md}&orderNumber=x&operation=deposited&status=1` }));
    const p4 = await newPayment(false);
    const before4 = (await paidUntil()) ?? new Date();
    const meta4 = calls.meta;
    const res4 = await Promise.all([cb(p4.md), cb(p4.md), cb(p4.md), cb(p4.md), cb(p4.md), vtb.settleVtbPayment(p4.id), vtb.settleVtbPayment(p4.id)]);
    const after4 = await paidUntil();
    const days = after4 ? Math.round((after4.getTime() - Math.max(before4.getTime(), Date.now() - 60_000)) / 864e5) : -1;
    const approved = await prisma.pendingPayment.count({ where: { id: p4.id, status: "APPROVED" } });
    check(`4 боевой: 5 callback + 2 settle → продлено один раз (+${days} дн.), заявка APPROVED`, days === 30 && approved === 1, { days });
    check("4 боевой: все callback ответили 200", res4.slice(0, 5).every((x: any) => x.status === 200));
    check("4 боевой: Meta Purchase ушёл один раз (на подменённый адрес)", calls.meta - meta4 <= 1, calls.meta - meta4);

    // 5) Сумма не сошлась → PRO нет, одно сообщение
    const p5 = await newPayment(false, 5000);
    gwOrders.get(p5.md)!.amount = 4000 * 100;
    const before5 = await paidUntil();
    const tg5 = calls.telegram;
    const r5a = await vtb.settleVtbPayment(p5.id);
    const r5b = await vtb.settleVtbPayment(p5.id);
    check("5 сумма не сошлась → ok:false mismatch, PRO не продлён", !r5a.ok && (r5a as any).mismatch && !r5b.ok && String(await paidUntil()) === String(before5));
    check("5 сообщение владельцу одно на два захода", calls.telegram - tg5 === 1, calls.telegram - tg5);

    // 7) Лимиты callback: по заказу (10/10 мин → дальше 200 без похода в шлюз), по IP (60/мин → 429)
    // Неоплаченный заказ (статус 0): лимит проверяем без зачисления — на каждый пропущенный
    // callback ровно 2 запроса в шлюз (по mdOrder и по orderNumber в settle)
    const p7 = await newPayment(false);
    gwOrders.get(p7.md)!.orderStatus = 0;
    const gw0 = calls.gateway;
    const r7: number[] = [];
    for (let i = 0; i < 12; i++) r7.push((await cb(p7.md, `203.0.113.${100 + i}`)).status);
    check("7 по заказу: 12 callback → в шлюз ушли только первые 10 (20 запросов), все 200", calls.gateway - gw0 === 20 && r7.every((s) => s === 200), { gw: calls.gateway - gw0, r7 });
    const gw1 = calls.gateway;
    for (let i = 0; i < 3; i++) await cb(p7.md, "203.0.113.200");
    check("7 по заказу: сверх лимита шлюз не спрашиваем", calls.gateway === gw1, calls.gateway - gw1);
    let got429 = false;
    for (let i = 0; i < 62; i++) { const s = (await cb(`md-junk-${i}`, "203.0.113.250")).status; if (s === 429) { got429 = true; break; } }
    check("7 по IP: больше 60 в минуту → 429", got429);

    // 8) Крон без секрета → 401; с секретом — как раньше
    const req = (h?: string) => new Request("https://potolok.ai/api/cron/x", { headers: h ? { authorization: h } : {} });
    const sec = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    check("8 нет CRON_SECRET: «Bearer undefined» → отказ", !isCronAuthorized(req("Bearer undefined")) && !isCronAuthorized(req("Bearer ")) && !isCronAuthorized(req()));
    process.env.CRON_SECRET = "ctl-secret-value";
    check("8 есть секрет: верный → да, неверный → нет", isCronAuthorized(req("Bearer ctl-secret-value")) && !isCronAuthorized(req("Bearer x")));
    if (sec === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = sec;

    check("ни одного исходящего запроса мимо подмены", calls.other.length === 0, calls.other);
  } catch (err) {
    fails++;
    console.log("ERROR", err);
  } finally {
    for (const [name, run] of [
      ["payments", () => prisma.pendingPayment.deleteMany({ where: { OR: [{ id: { in: created.payments } }, { masterId: { in: created.masters } }] } })],
      ["sessions", () => prisma.session.deleteMany({ where: { masterId: { in: created.masters } } })],
      ["masters", () => prisma.master.deleteMany({ where: { id: { in: created.masters } } })],
    ] as [string, () => Promise<unknown>][]) {
      try { await run(); } catch (e) { fails++; console.log("УБОРКА НЕ УДАЛАСЬ:", name, String(e).slice(0, 160)); }
    }
    console.log("CTL удалены:", JSON.stringify({ masters: created.masters.length, payments: created.payments.length }), "осталось мастеров:", await prisma.master.count({ where: { id: { in: created.masters } } }));
    console.log(fails ? `FAIL ${fails}` : "PASS");
    globalThis.fetch = realFetch;
    clearInterval(keep);
    process.exit(fails ? 1 : 0);
  }
})();
