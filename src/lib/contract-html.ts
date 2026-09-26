import type { CalculationResult, RoomResult } from "./types";
import { asLang, tFor, formatDocDate, type Lang } from "./i18n";
import "./i18n/contract";
import { fillTemplate, type PlaceholderKey } from "./contract-template";

export interface MasterData {
  firstName: string;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  whatsappPhone?: string | null;
  address?: string | null;
  contractType?: string | null;
  bin?: string | null;
  iin?: string | null;
  legalName?: string | null;
  legalAddress?: string | null;
  bankName?: string | null;
  iban?: string | null;
  kbe?: string | null;
  bik?: string | null;
  passportData?: string | null;
  prepaymentPercent: number;
  warrantyMaterials: number;
  warrantyInstall: number;
  contractCity?: string | null;
}

export interface EstimateData {
  publicId: string;
  clientName?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  total: number;
  createdAt: Date;
  workStartDate?: Date | string | null;
  workDurationDays?: number | null;
  paymentSchedule?: PaymentStage[] | null;
}

export type PaymentStage = {
  name: string;
  percent: number;
  when: string; // before_start | on_start_day | on_delivery | after_install | after_act
};

type T = ReturnType<typeof tFor>;

/** Момент оплаты: переводится только известный код, чужой текст остаётся как есть. */
const WHEN_CODES = new Set([
  "before_start",
  "on_start_day",
  "on_delivery",
  "after_install",
  "after_act",
]);

function whenLabel(when: string, t: T): string {
  return WHEN_CODES.has(when) ? t(`ct.pay.${when}`) : esc(when);
}

function defaultPaymentSchedule(prepaymentPercent: number, t: T): PaymentStage[] {
  const prep = Math.max(0, Math.min(100, prepaymentPercent || 50));
  const rest = 100 - prep;
  if (prep === 0) {
    return [{ name: t("ct.stage.byFact"), percent: 100, when: "after_act" }];
  }
  if (prep === 100) {
    return [{ name: t("ct.stage.fullPrepay"), percent: 100, when: "before_start" }];
  }
  return [
    { name: t("ct.stage.prepay"), percent: prep, when: "before_start" },
    { name: t("ct.stage.final"), percent: rest, when: "after_act" },
  ];
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtPrice(n: number | undefined | null): string {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(val)) + " ₸";
}

/**
 * Дата в документе. Русский вид не трогаем ни на символ (это боевой договор),
 * казахский берём из общего `formatDocDate`: «2026 жылғы 5 қыркүйек».
 */
function fmtDate(d: Date, lang: Lang = "ru"): string {
  if (lang === "kk") return formatDocDate(new Date(d), "kk");
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getMasterName(m: MasterData): string {
  return m.legalName || m.companyName || `${m.firstName} ${m.lastName || ""}`.trim();
}

function getMasterPhone(m: MasterData): string {
  return m.whatsappPhone || m.phone || "";
}

function getRoomResults(calc: CalculationResult | null | undefined): RoomResult[] {
  if (!calc) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return calc.roomResults ?? (calc as any).variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
}

/**
 * Таблица работ договора и акта.
 *
 * Раньше печатались только позиции по комнатам, а «Дополнительно», надбавка
 * за высоту и скидка — нет. Клиент складывал столбик и получал одну сумму,
 * а в пункте «Общая стоимость» стояла другая, больше на десятки процентов
 * (аудит 24.09.2026). Теперь таблица сходится с итогом.
 */
function buildWorksTable(roomResults: RoomResult[], t: T, calc?: CalculationResult | null): string {
  let rows = "";
  let num = 0;
  const row = (name: string, qty: string, unit: string, price: string, sum: string) => {
    num++;
    return `<tr>
        <td style="${tdStyle}">${num}</td>
        <td style="${tdStyle}">${name}</td>
        <td style="${tdStyle} text-align:center;">${qty}</td>
        <td style="${tdStyle} text-align:center;">${unit}</td>
        <td style="${tdStyle} text-align:right;">${price}</td>
        <td style="${tdStyle} text-align:right;">${sum}</td>
      </tr>`;
  };

  let roomsSum = 0;
  for (const rr of roomResults) {
    for (const item of (rr.items ?? [])) {
      roomsSum += item.total ?? 0;
      rows += row(
        `${esc(item.itemName)} (${esc(rr.roomName)})`,
        String(item.quantity),
        esc(item.unit),
        fmtPrice(item.unitPrice),
        fmtPrice(item.total),
      );
    }
  }

  // Надбавка за высоту потолка — считается по комнатам, в позициях её нет.
  const heightExtra = (calc?.roomResults ?? []).reduce((acc, rr) => {
    const after = (rr as { subtotalAfterHeight?: number }).subtotalAfterHeight;
    const before = (rr as { subtotal?: number }).subtotal;
    return acc + (after != null && before != null && after > before ? after - before : 0);
  }, 0);
  if (heightExtra > 0) {
    rows += row(t("ct.heightExtra"), "1", t("ct.unitService"), fmtPrice(heightExtra), fmtPrice(heightExtra));
  }

  for (const extra of (calc?.extraItems ?? [])) {
    rows += row(
      esc(extra.itemName),
      String(extra.quantity ?? 1),
      esc(extra.unit ?? t("ct.unitService")),
      fmtPrice(extra.unitPrice ?? extra.total ?? 0),
      fmtPrice(extra.total ?? 0),
    );
  }

  const discount = (calc as { discountAmount?: number } | null | undefined)?.discountAmount ?? 0;
  if (discount > 0) {
    rows += row(t("ct.discount"), "1", t("ct.unitService"), `−${fmtPrice(discount)}`, `−${fmtPrice(discount)}`);
  }
  void roomsSum;
  return rows;
}

const tdStyle = "padding:4px 8px;border:1px solid #999;font-size:12px;";
const thStyle = "padding:6px 8px;border:1px solid #999;font-size:11px;font-weight:bold;background:#f0f0f0;";

const pageStyle = `
  @page { margin: 20mm; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #000;
    margin: 0;
    padding: 24px;
    font-size: 13px;
    line-height: 1.5;
  }
  h1 { text-align: center; font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  .center { text-align: center; }
  .parties { margin: 12px 0; }
  .section { margin: 12px 0; }
  .sign-block { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
  .sign-col { flex: 1; }
  .sign-line { border-bottom: 1px solid #000; min-width: 200px; display: inline-block; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
`;

/** Шапка таблицы работ — одинаковая в договоре и акте. */
function worksTableHead(t: T): string {
  return `<tr>
          <th style="${thStyle} width:30px;">${t("ct.th.num")}</th>
          <th style="${thStyle}">${t("ct.th.name")}</th>
          <th style="${thStyle} width:50px;">${t("ct.th.qty")}</th>
          <th style="${thStyle} width:50px;">${t("ct.th.unit")}</th>
          <th style="${thStyle} width:80px;">${t("ct.th.price")}</th>
          <th style="${thStyle} width:90px;">${t("ct.th.sum")}</th>
        </tr>`;
}

// ============================================
// CONTRACT (Договор / Соглашение)
// ============================================

export function generateContractHtml(
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult,
  language: Lang | string = "ru"
): string {
  const lang = asLang(language);
  const t = tFor(lang);
  const isIp = master.contractType === "ip";
  const kind = isIp ? "ip" : "ind";
  const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
  const date = fmtDate(estimate.createdAt, lang);
  const city = esc(master.contractCity) || "_______________";
  const total = estimate.total;
  const roomResults = getRoomResults(calc);
  const worksRows = buildWorksTable(roomResults, t, calc);

  // Условия договора (даты + схема оплаты)
  const schedule: PaymentStage[] =
    estimate.paymentSchedule && estimate.paymentSchedule.length > 0
      ? estimate.paymentSchedule
      : defaultPaymentSchedule(master.prepaymentPercent, t);
  const startDateStr = estimate.workStartDate
    ? fmtDate(new Date(estimate.workStartDate), lang)
    : t("ct.byAgreement");
  const durationStr = estimate.workDurationDays
    ? `${estimate.workDurationDays} ${workDayWord(estimate.workDurationDays, lang)}`
    : t("ct.byAgreement");

  const title = t(`ct.title.${kind}`);

  // Executor info
  let executorText: string;
  if (isIp) {
    executorText = `<strong>${esc(getMasterName(master))}</strong>` +
      (master.bin ? t("ct.reqBin", { v: esc(master.bin) }) : "") +
      (master.iin ? t("ct.reqIin", { v: esc(master.iin) }) : "") +
      t("ct.executorNamed");
  } else {
    executorText = `<strong>${esc(getMasterName(master))}</strong>` +
      (master.iin ? t("ct.reqIin", { v: esc(master.iin) }) : "") +
      (master.passportData ? t("ct.reqIdDoc", { v: esc(master.passportData) }) : "") +
      t("ct.executorNamed");
  }

  // Client info
  const clientName = esc(estimate.clientName) || "___________________________";
  const clientPhone = esc(estimate.clientPhone) || "_______________";
  const clientAddress = esc(estimate.clientAddress) || "___________________________";

  // Requisites block
  let executorReqs: string;
  if (isIp) {
    executorReqs = `
      <p><strong>${t("ct.executor")}</strong></p>
      <p>${esc(getMasterName(master))}</p>
      ${master.bin ? `<p>${t("ct.lbl.bin")}: ${esc(master.bin)}</p>` : ""}
      ${master.iin ? `<p>${t("ct.lbl.iin")}: ${esc(master.iin)}</p>` : ""}
      ${master.legalAddress ? `<p>${t("ct.lbl.address")}: ${esc(master.legalAddress)}</p>` : ""}
      ${master.bankName ? `<p>${t("ct.lbl.bank")}: ${esc(master.bankName)}</p>` : ""}
      ${master.iban ? `<p>${t("ct.lbl.iban")}: ${esc(master.iban)}</p>` : ""}
      ${master.kbe ? `<p>${t("ct.lbl.kbe")}: ${esc(master.kbe)}</p>` : ""}
      ${master.bik ? `<p>${t("ct.lbl.bik")}: ${esc(master.bik)}</p>` : ""}
      <p>${t("ct.lbl.phone")}: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>${t("ct.sign")}</p>
    `;
  } else {
    executorReqs = `
      <p><strong>${t("ct.executor")}</strong></p>
      <p>${esc(getMasterName(master))}</p>
      ${master.iin ? `<p>${t("ct.lbl.iin")}: ${esc(master.iin)}</p>` : ""}
      ${master.passportData ? `<p>${t("ct.lbl.idDoc")}: ${esc(master.passportData)}</p>` : ""}
      <p>${t("ct.lbl.phone")}: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>${t("ct.sign")}</p>
    `;
  }

  const clientReqs = `
    <p><strong>${t("ct.client")}</strong></p>
    <p>${t("ct.lbl.fio")}: ${clientName}</p>
    <p>${t("ct.lbl.phone")}: ${clientPhone}</p>
    <p>${t("ct.lbl.address")}: ${clientAddress}</p>
    <p>${t("ct.lbl.iin")}: _______________</p>
    <br>
    <p>${t("ct.sign")}</p>
  `;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${title} №${contractNum}</title>
  <style>${pageStyle}</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="center">${t("ct.numDate", { num: contractNum, date })}</p>
  <p class="center">${city}</p>

  <div class="parties">
    <p>${executorText}${t("ct.oneSide")}</p>
    <p><strong>${clientName}</strong>${t(`ct.clientNamed.${kind}`)}</p>
  </div>

  <h2>${t(`ct.h1.${kind}`)}</h2>
  <div class="section">
    <p>${t("ct.p11", { address: clientAddress })}</p>
    <p>${t("ct.p12")}</p>
    <table>
      <thead>
        ${worksTableHead(t)}
      </thead>
      <tbody>
        ${worksRows}
      </tbody>
    </table>
  </div>

  <h2>${t("ct.h2")}</h2>
  <div class="section">
    <p>${t(`ct.p21.${kind}`, { sum: fmtPrice(total), words: numberToWordsKz(total, lang) })}</p>
    <p>${t("ct.p22")}</p>
    ${schedule
      .map(
        (s, i) => `<p>&nbsp;&nbsp;&nbsp;${String.fromCharCode(0x430 + i)}) ${esc(s.name)} — ${s.percent}% — <strong>${fmtPrice(Math.round((total * s.percent) / 100))}</strong> — ${whenLabel(s.when, t)};</p>`,
      )
      .join("\n    ")}
    <p>${t(`ct.p23.${kind}`)}</p>
  </div>

  <h2>${t("ct.h3")}</h2>
  <div class="section">
    <p>${t("ct.p31", { date: startDateStr })}</p>
    <p>${t("ct.p32", { duration: durationStr })}</p>
    <p>${t("ct.p33")}</p>
  </div>

  <h2>${t("ct.h4")}</h2>
  <div class="section">
    <p>${t("ct.p41")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p41a", { term: `${master.warrantyMaterials} ${yearWord(master.warrantyMaterials, lang)}` })}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p41b", { term: `${master.warrantyInstall} ${yearWord(master.warrantyInstall, lang)}` })}</p>
    <p>${t("ct.p42")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p42a")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p42b")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p42c")}</p>
    <p>${t("ct.p43")}</p>
  </div>

  <h2>${t("ct.h5")}</h2>
  <div class="section">
    <p><strong>${t("ct.p51")}</strong></p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p51a")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p51b")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p51c")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p51d")}</p>
    <p><strong>${t("ct.p52")}</strong></p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p52a")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p52b")}</p>
    <p>&nbsp;&nbsp;&nbsp;${t("ct.p52c")}</p>
  </div>

  <h2>${t("ct.h6")}</h2>
  <div class="section">
    <p>${t("ct.p61")}</p>
    <p>${t("ct.p62")}</p>
  </div>

  <h2>${t("ct.h7")}</h2>
  <div class="section">
    <p>${t("ct.p71")}</p>
  </div>

  <h2>${t("ct.h8")}</h2>
  <div class="section">
    <p>${t(`ct.p81.${kind}`)}</p>
    <p>${t("ct.p82")}</p>
    <p>${t(`ct.p83.${kind}`)}</p>
  </div>

  <h2>${t("ct.h9")}</h2>
  <div class="sign-block">
    <div class="sign-col">
      ${executorReqs}
    </div>
    <div class="sign-col">
      ${clientReqs}
    </div>
  </div>

  <p style="font-size:10px;color:#999;text-align:center;margin-top:40px;">
    ${t("ct.footer")}
  </p>
</body>
</html>`;
}

// ============================================
// ACT (Акт выполненных работ)
// ============================================

export function generateActHtml(
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult,
  language: Lang | string = "ru"
): string {
  const lang = asLang(language);
  const t = tFor(lang);
  const kind = master.contractType === "ip" ? "ip" : "ind";
  const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
  // Дата акта — та, что записана при подписании. Раньше подставлялась
  // текущая, и подписанный месяц назад акт каждый раз открывался
  // сегодняшним числом (аудит 24.09.2026).
  const today = fmtDate(estimate.createdAt ? new Date(estimate.createdAt) : new Date(), lang);
  const city = esc(master.contractCity) || "_______________";
  const total = estimate.total;
  const roomResults = getRoomResults(calc);
  const worksRows = buildWorksTable(roomResults, t, calc);

  const masterName = esc(getMasterName(master));
  const clientName = esc(estimate.clientName) || "___________________________";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t("act.docTitle", { num: contractNum })}</title>
  <style>${pageStyle}</style>
</head>
<body>
  <h1>${t("act.title")}</h1>
  <p class="center">${t(`act.toDoc.${kind}`, { num: contractNum })}</p>
  <p class="center">${today}, ${city}</p>

  <div class="parties">
    <p>${t("act.executor")}<strong>${masterName}</strong></p>
    <p>${t("act.client")}<strong>${clientName}</strong></p>
  </div>

  <div class="section">
    <p>${t("act.intro")}</p>

    <table>
      <thead>
        ${worksTableHead(t)}
      </thead>
      <tbody>
        ${worksRows}
      </tbody>
    </table>

    <p style="text-align:right;margin-top:8px;">
      <strong>${t("act.total", { sum: fmtPrice(total) })}</strong>
    </p>
  </div>

  <div class="section">
    <p>${t("act.noClaims")}</p>
    <p>${t("act.sum", { sum: fmtPrice(total), words: numberToWordsKz(total, lang) })}</p>
  </div>

  <div class="sign-block">
    <div class="sign-col">
      <p><strong>${t("ct.executor")}</strong></p>
      <p>${masterName}</p>
      <p>${t("ct.lbl.phone")}: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>${t("ct.sign")}</p>
      <p style="font-size:11px;color:#666;">${t("act.date", { date: today })}</p>
    </div>
    <div class="sign-col">
      <p><strong>${t("ct.client")}</strong></p>
      <p>${clientName}</p>
      <p>${t("ct.lbl.phone")}: ${esc(estimate.clientPhone) || "_______________"}</p>
      <br>
      <p>${t("ct.sign")}</p>
      <p style="font-size:11px;color:#666;">${t("act.date", { date: "_______________" })}</p>
    </div>
  </div>

  <p style="font-size:10px;color:#999;text-align:center;margin-top:40px;">
    ${t("ct.footer")}
  </p>
</body>
</html>`;
}

// ============================================
// Helpers
// ============================================

/** «год / года / лет» по-русски, по-казахски существительное не меняется. */
function yearWord(n: number, lang: Lang = "ru"): string {
  if (lang === "kk") return "жыл";
  if (n % 10 === 1 && n % 100 !== 11) return "год";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "года";
  return "лет";
}

/** «рабочий день / рабочих дня / рабочих дней»; по-казахски — «жұмыс күні». */
function workDayWord(n: number, lang: Lang = "ru"): string {
  if (lang === "kk") return "жұмыс күні";
  if (n % 10 === 1 && n % 100 !== 11) return "рабочий день";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "рабочих дня";
  return "рабочих дней";
}

/**
 * Сумма прописью. В договоре это то, по чему считают, если цифры оспаривают,
 * поэтому пишем на языке документа: по-русски «четыреста восемьдесят одна
 * тысяча тенге», по-казахски «төрт жүз сексен бір мың теңге».
 */
function numberToWordsKz(amount: number, lang: Lang = "ru"): string {
  if (lang === "kk") return numberToWordsKazakh(amount);
  const n = Math.round(amount);
  if (n === 0) return "ноль тенге";

  const units = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
    "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят",
    "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот",
    "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  function threeDigits(num: number): string {
    if (num === 0) return "";
    const parts: string[] = [];
    const h = Math.floor(num / 100);
    const remainder = num % 100;
    const t = Math.floor(remainder / 10);
    const u = remainder % 10;

    if (h > 0) parts.push(hundreds[h]);
    if (remainder >= 10 && remainder < 20) {
      parts.push(teens[remainder - 10]);
    } else {
      if (t > 0) parts.push(tens[t]);
      if (u > 0) parts.push(units[u]);
    }
    return parts.join(" ");
  }

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  if (millions > 0) {
    const mWord = millions % 10 === 1 && millions % 100 !== 11 ? "миллион"
      : [2, 3, 4].includes(millions % 10) && ![12, 13, 14].includes(millions % 100) ? "миллиона"
      : "миллионов";
    parts.push(`${threeDigits(millions)} ${mWord}`);
  }

  if (thousands > 0) {
    let tText = threeDigits(thousands);
    // "один тысяча" → "одна тысяча", "два тысячи" → "две тысячи"
    // «один тысяча» → «одна тысяча». Через \b не работало: в JS граница слова
    // не срабатывает перед кириллицей, и каждый договор с суммой вроде
    // 481 000 печатал «четыреста восемьдесят один тысяча» (аудит 24.09.2026).
    tText = tText.replace(/один$/, "одна").replace(/два$/, "две");
    const tWord = thousands % 10 === 1 && thousands % 100 !== 11 ? "тысяча"
      : [2, 3, 4].includes(thousands % 10) && ![12, 13, 14].includes(thousands % 100) ? "тысячи"
      : "тысяч";
    parts.push(`${tText} ${tWord}`);
  }

  if (rest > 0) {
    parts.push(threeDigits(rest));
  }

  return parts.join(" ").trim() + " тенге";
}

/**
 * Сумма прописью по-казахски. В казахском числительные не согласуются:
 * «екі мың», «бес жүз мың», «үш миллион» — форма слова одна, меняется только
 * множитель, поэтому склонений здесь нет.
 */
function numberToWordsKazakh(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "нөл теңге";

  const units = ["", "бір", "екі", "үш", "төрт", "бес", "алты", "жеті", "сегіз", "тоғыз"];
  const tens = ["", "он", "жиырма", "отыз", "қырық", "елу", "алпыс", "жетпіс", "сексен", "тоқсан"];

  function threeDigits(num: number): string {
    if (num === 0) return "";
    const parts: string[] = [];
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    // 100 — «жүз», 200 — «екі жүз»: «бір жүз» в казахском не говорят.
    if (h === 1) parts.push("жүз");
    else if (h > 1) parts.push(`${units[h]} жүз`);
    if (t > 0) parts.push(tens[t]);
    if (u > 0) parts.push(units[u]);
    return parts.join(" ");
  }

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  if (millions > 0) parts.push(`${threeDigits(millions)} миллион`);
  if (thousands > 0) parts.push(`${threeDigits(thousands)} мың`);
  if (rest > 0) parts.push(threeDigits(rest));

  return parts.join(" ").trim() + " теңге";
}

// ============================================
// СВОЙ ДОГОВОР МАСТЕРА: печать из шаблона с метками (26.09.2026)
// ============================================

/** Дата в договоре — тем же видом, что печатает типовой. */
export function dateText(d: Date | string, language: Lang | string = "ru"): string {
  return fmtDate(new Date(d), asLang(language));
}

/** «10 рабочих дней» / «10 жұмыс күні». */
export function durationText(days: number, language: Lang | string = "ru"): string {
  return `${days} ${workDayWord(days, asLang(language))}`;
}

/** «10 лет» / «10 жыл» — срок гарантии. */
export function yearsText(years: number, language: Lang | string = "ru"): string {
  return `${years} ${yearWord(years, asLang(language))}`;
}

/**
 * Реквизиты исполнителя строками <p> — без имени, телефона и подписи: они
 * в шаблоне стоят отдельными метками, чтобы мастер мог их переставить.
 */
function executorRequisites(master: MasterData, t: T): string {
  const lines: string[] = [];
  if (master.contractType === "ip") {
    if (master.bin) lines.push(`<p>${t("ct.lbl.bin")}: ${esc(master.bin)}</p>`);
    if (master.iin) lines.push(`<p>${t("ct.lbl.iin")}: ${esc(master.iin)}</p>`);
    if (master.legalAddress) lines.push(`<p>${t("ct.lbl.address")}: ${esc(master.legalAddress)}</p>`);
    if (master.bankName) lines.push(`<p>${t("ct.lbl.bank")}: ${esc(master.bankName)}</p>`);
    if (master.iban) lines.push(`<p>${t("ct.lbl.iban")}: ${esc(master.iban)}</p>`);
    if (master.kbe) lines.push(`<p>${t("ct.lbl.kbe")}: ${esc(master.kbe)}</p>`);
    if (master.bik) lines.push(`<p>${t("ct.lbl.bik")}: ${esc(master.bik)}</p>`);
  } else {
    if (master.iin) lines.push(`<p>${t("ct.lbl.iin")}: ${esc(master.iin)}</p>`);
    if (master.passportData) lines.push(`<p>${t("ct.lbl.idDoc")}: ${esc(master.passportData)}</p>`);
  }
  return lines.join("\n      ");
}

/** Схема оплаты договора: своя у КП или по проценту предоплаты из профиля. */
function scheduleOf(master: MasterData, estimate: EstimateData, t: T): PaymentStage[] {
  return estimate.paymentSchedule && estimate.paymentSchedule.length > 0
    ? estimate.paymentSchedule
    : defaultPaymentSchedule(master.prepaymentPercent, t);
}

/**
 * Значения меток для конкретного договора. Считаются теми же функциями, что
 * и типовой договор: сумма прописью, дата, таблица работ выглядят одинаково,
 * правил ли мастер шаблон или нет.
 */
export function contractPlaceholderValues(
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult,
  language: Lang | string = "ru",
): Record<PlaceholderKey, string> {
  const lang = asLang(language);
  const t = tFor(lang);
  const total = estimate.total;
  const schedule = scheduleOf(master, estimate, t);
  const first = schedule[0];
  return {
    клиент: esc(estimate.clientName) || "___________________________",
    телефон_клиента: esc(estimate.clientPhone) || "_______________",
    адрес: esc(estimate.clientAddress) || "___________________________",
    // В типовом тексте знак ₸ стоит после метки: «{сумма} ₸».
    сумма: fmtPrice(total).replace(/\s*₸$/, ""),
    сумма_прописью: numberToWordsKz(total, lang),
    предоплата: fmtPrice(Math.round((total * (first?.percent ?? 50)) / 100)),
    остаток: fmtPrice(Math.round((total * (100 - (first?.percent ?? 50))) / 100)),
    срок: estimate.workDurationDays ? durationText(estimate.workDurationDays, lang) : t("ct.byAgreement"),
    дата_начала: estimate.workStartDate ? dateText(estimate.workStartDate, lang) : t("ct.byAgreement"),
    исполнитель: esc(getMasterName(master)),
    реквизиты_исполнителя: executorRequisites(master, t),
    телефон_исполнителя: esc(getMasterPhone(master)),
    город: esc(master.contractCity) || "_______________",
    дата: dateText(estimate.createdAt, lang),
    номер: estimate.publicId.slice(0, 8).toUpperCase(),
    таблица_работ: buildWorksTable(getRoomResults(calc), t, calc),
    гарантия_материал: yearsText(master.warrantyMaterials, lang),
    гарантия_монтаж: yearsText(master.warrantyInstall, lang),
  };
}

const PREPAY_TAG = /\{\s*предоплата\s*\}/gi;
const REST_TAG = /\{\s*остаток\s*\}/gi;
const SUM_TAG = /\{\s*сумма\s*\}/i;
/** Сумма в тексте: «50 000 ₸», «50 000 тенге», «50 000 теңге». */
const MONEY_RE = /(\d[\d\s\u00a0\u202f]{2,})\s?(?:₸|тенге|теңге)/g;

/**
 * Договор из шаблона мастера.
 *
 * Метка {предоплата} — сумма этапа оплаты. Мастер пишет в шаблоне
 * «Предоплата — 30% — {предоплата}», и сумма считается от процента в той же
 * строке: так один и тот же шаблон печатает верные цифры и при 30/70, и при
 * 50/50. Если процента в строке нет — берём этапы договора по порядку.
 *
 * Метка {остаток} — то, что осталось заплатить: сумма договора минус все
 * суммы, названные между строкой «{сумма}» и самой меткой. Нужна, когда
 * предоплата фиксированная («50 000 ₸, остальное после акта»): процент тут
 * не поможет, а «остальная сумма» без цифры клиенту ни о чём (26.09.2026).
 */
export function renderContractTemplate(
  body: string,
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult,
  language: Lang | string = "ru",
): string {
  const lang = asLang(language);
  const t = tFor(lang);
  const total = estimate.total;
  const schedule = scheduleOf(master, estimate, t);
  let stage = 0;
  const withStages = body.replace(PREPAY_TAG, (whole: string, offset: number) => {
    const lineStart = Math.max(body.lastIndexOf("<p", offset), body.lastIndexOf("\n", offset), 0);
    const ends = [body.indexOf("</p>", offset), body.indexOf("\n", offset)].filter((i) => i >= 0);
    const lineEnd = ends.length ? Math.min(...ends) : body.length;
    const line = body.slice(lineStart, lineEnd);
    const inLine = line.match(/(\d{1,3})\s*%/);
    const percent = inLine ? Number(inLine[1]) : schedule[stage]?.percent;
    stage++;
    if (percent == null || !Number.isFinite(percent)) return whole;
    return fmtPrice(Math.round((total * percent) / 100));
  });
  const sumAt = withStages.search(SUM_TAG);
  const withRest = withStages.replace(REST_TAG, (whole: string, offset: number) => {
    const region = withStages.slice(sumAt >= 0 && sumAt < offset ? sumAt : 0, offset);
    let paid = 0;
    for (const m of region.matchAll(MONEY_RE)) {
      const n = Number(m[1].replace(/[\s\u00a0\u202f]/g, ""));
      if (Number.isFinite(n) && n > 0 && n < total) paid += n;
    }
    return fmtPrice(Math.max(0, total - paid));
  });
  return fillTemplate(withRest, contractPlaceholderValues(master, estimate, calc, lang));
}
