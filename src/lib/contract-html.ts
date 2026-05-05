import type { CalculationResult, RoomResult } from "./types";

interface MasterData {
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

interface EstimateData {
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

const WHEN_LABELS: Record<string, string> = {
  before_start: "до начала выполнения работ",
  on_start_day: "в день начала работ",
  on_delivery: "при поставке материалов",
  after_install: "после завершения монтажа",
  after_act: "после подписания Акта выполненных работ",
};

function defaultPaymentSchedule(prepaymentPercent: number): PaymentStage[] {
  const prep = Math.max(0, Math.min(100, prepaymentPercent || 50));
  const rest = 100 - prep;
  if (prep === 0) {
    return [{ name: "Оплата по факту", percent: 100, when: "after_act" }];
  }
  if (prep === 100) {
    return [{ name: "Полная предоплата", percent: 100, when: "before_start" }];
  }
  return [
    { name: "Предоплата", percent: prep, when: "before_start" },
    { name: "Окончательный расчёт", percent: rest, when: "after_act" },
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

function fmtDate(d: Date): string {
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

function buildWorksTable(roomResults: RoomResult[]): string {
  let rows = "";
  let num = 0;
  for (const rr of roomResults) {
    for (const item of (rr.items ?? [])) {
      num++;
      rows += `<tr>
        <td style="${tdStyle}">${num}</td>
        <td style="${tdStyle}">${esc(item.itemName)} (${esc(rr.roomName)})</td>
        <td style="${tdStyle} text-align:center;">${item.quantity}</td>
        <td style="${tdStyle} text-align:center;">${esc(item.unit)}</td>
        <td style="${tdStyle} text-align:right;">${fmtPrice(item.unitPrice)}</td>
        <td style="${tdStyle} text-align:right;">${fmtPrice(item.total)}</td>
      </tr>`;
    }
  }
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

// ============================================
// CONTRACT (Договор / Соглашение)
// ============================================

export function generateContractHtml(
  master: MasterData,
  estimate: EstimateData,
  calc: CalculationResult
): string {
  const isIp = master.contractType === "ip";
  const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
  const date = fmtDate(estimate.createdAt);
  const city = esc(master.contractCity) || "_______________";
  const total = estimate.total;
  const roomResults = getRoomResults(calc);
  const worksRows = buildWorksTable(roomResults);

  // Условия договора (даты + схема оплаты)
  const schedule: PaymentStage[] =
    estimate.paymentSchedule && estimate.paymentSchedule.length > 0
      ? estimate.paymentSchedule
      : defaultPaymentSchedule(master.prepaymentPercent);
  const startDateStr = estimate.workStartDate
    ? fmtDate(new Date(estimate.workStartDate))
    : "по согласованию Сторон";
  const durationStr = estimate.workDurationDays
    ? `${estimate.workDurationDays} ${
        estimate.workDurationDays % 10 === 1 && estimate.workDurationDays % 100 !== 11
          ? "рабочий день"
          : [2, 3, 4].includes(estimate.workDurationDays % 10) &&
              ![12, 13, 14].includes(estimate.workDurationDays % 100)
            ? "рабочих дня"
            : "рабочих дней"
      }`
    : "по согласованию Сторон";

  const title = isIp
    ? "ДОГОВОР НА ОКАЗАНИЕ УСЛУГ"
    : "СОГЛАШЕНИЕ О ВЫПОЛНЕНИИ РАБОТ";

  // Executor info
  let executorText: string;
  if (isIp) {
    executorText = `<strong>${esc(getMasterName(master))}</strong>` +
      (master.bin ? `, БИН ${esc(master.bin)}` : "") +
      (master.iin ? `, ИИН ${esc(master.iin)}` : "") +
      `, именуемый(-ая) в дальнейшем «Исполнитель»`;
  } else {
    executorText = `<strong>${esc(getMasterName(master))}</strong>` +
      (master.iin ? `, ИИН ${esc(master.iin)}` : "") +
      (master.passportData ? `, удостоверение личности ${esc(master.passportData)}` : "") +
      `, именуемый(-ая) в дальнейшем «Исполнитель»`;
  }

  // Client info
  const clientName = esc(estimate.clientName) || "___________________________";
  const clientPhone = esc(estimate.clientPhone) || "_______________";
  const clientAddress = esc(estimate.clientAddress) || "___________________________";

  // Requisites block
  let executorReqs: string;
  if (isIp) {
    executorReqs = `
      <p><strong>Исполнитель:</strong></p>
      <p>${esc(getMasterName(master))}</p>
      ${master.bin ? `<p>БИН: ${esc(master.bin)}</p>` : ""}
      ${master.iin ? `<p>ИИН: ${esc(master.iin)}</p>` : ""}
      ${master.legalAddress ? `<p>Адрес: ${esc(master.legalAddress)}</p>` : ""}
      ${master.bankName ? `<p>Банк: ${esc(master.bankName)}</p>` : ""}
      ${master.iban ? `<p>IBAN: ${esc(master.iban)}</p>` : ""}
      ${master.kbe ? `<p>КБе: ${esc(master.kbe)}</p>` : ""}
      ${master.bik ? `<p>БИК: ${esc(master.bik)}</p>` : ""}
      <p>Тел: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>Подпись ________________</p>
    `;
  } else {
    executorReqs = `
      <p><strong>Исполнитель:</strong></p>
      <p>${esc(getMasterName(master))}</p>
      ${master.iin ? `<p>ИИН: ${esc(master.iin)}</p>` : ""}
      ${master.passportData ? `<p>Уд. личности: ${esc(master.passportData)}</p>` : ""}
      <p>Тел: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>Подпись ________________</p>
    `;
  }

  const clientReqs = `
    <p><strong>Заказчик:</strong></p>
    <p>ФИО: ${clientName}</p>
    <p>Тел: ${clientPhone}</p>
    <p>Адрес: ${clientAddress}</p>
    <p>ИИН: _______________</p>
    <br>
    <p>Подпись ________________</p>
  `;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title} №${contractNum}</title>
  <style>${pageStyle}</style>
</head>
<body>
  <h1>${title}</h1>
  <p class="center">№ ${contractNum} от ${date}</p>
  <p class="center">${city}</p>

  <div class="parties">
    <p>${executorText}, с одной стороны, и</p>
    <p><strong>${clientName}</strong>, именуемый(-ая) в дальнейшем «Заказчик», с другой стороны,
    совместно именуемые «Стороны», заключили настоящий ${isIp ? "Договор" : "Соглашение"} о нижеследующем:</p>
  </div>

  <h2>1. ПРЕДМЕТ ${isIp ? "ДОГОВОРА" : "СОГЛАШЕНИЯ"}</h2>
  <div class="section">
    <p>1.1. Исполнитель обязуется выполнить работы по монтажу натяжных потолков по адресу: ${clientAddress},
    а Заказчик обязуется принять и оплатить выполненные работы.</p>
    <p>1.2. Перечень и объём работ:</p>
    <table>
      <thead>
        <tr>
          <th style="${thStyle} width:30px;">№</th>
          <th style="${thStyle}">Наименование</th>
          <th style="${thStyle} width:50px;">Кол.</th>
          <th style="${thStyle} width:50px;">Ед.</th>
          <th style="${thStyle} width:80px;">Цена</th>
          <th style="${thStyle} width:90px;">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${worksRows}
      </tbody>
    </table>
  </div>

  <h2>2. СТОИМОСТЬ РАБОТ И ПОРЯДОК ОПЛАТЫ</h2>
  <div class="section">
    <p>2.1. Общая стоимость работ по настоящему ${isIp ? "Договору" : "Соглашению"} составляет:
    <strong>${fmtPrice(total)}</strong> (${numberToWordsKz(total)}).</p>
    <p>2.2. Оплата производится в следующем порядке:</p>
    ${schedule
      .map(
        (s, i) => `<p>&nbsp;&nbsp;&nbsp;${String.fromCharCode(0x430 + i)}) ${esc(s.name)} — ${s.percent}% — <strong>${fmtPrice(Math.round((total * s.percent) / 100))}</strong> — ${WHEN_LABELS[s.when] ?? esc(s.when)};</p>`,
      )
      .join("\n    ")}
    <p>2.3. Оплата производится наличными или переводом на ${isIp ? "расчётный счёт Исполнителя" : "карту Исполнителя"}.</p>
  </div>

  <h2>3. СРОКИ ВЫПОЛНЕНИЯ РАБОТ</h2>
  <div class="section">
    <p>3.1. Дата начала работ: ${startDateStr}</p>
    <p>3.2. Срок выполнения работ: ${durationStr} с момента начала работ.</p>
    <p>3.3. Сроки могут быть скорректированы по взаимному согласию Сторон.</p>
  </div>

  <h2>4. ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА</h2>
  <div class="section">
    <p>4.1. Исполнитель предоставляет гарантию:</p>
    <p>&nbsp;&nbsp;&nbsp;а) На материалы (полотно) — <strong>${master.warrantyMaterials} ${yearWord(master.warrantyMaterials)}</strong>;</p>
    <p>&nbsp;&nbsp;&nbsp;б) На монтажные работы — <strong>${master.warrantyInstall} ${yearWord(master.warrantyInstall)}</strong>.</p>
    <p>4.2. Гарантия не распространяется на повреждения, возникшие в результате:</p>
    <p>&nbsp;&nbsp;&nbsp;— затопления со стороны соседей или коммуникаций;</p>
    <p>&nbsp;&nbsp;&nbsp;— механических повреждений, нанесённых Заказчиком или третьими лицами;</p>
    <p>&nbsp;&nbsp;&nbsp;— нарушения условий эксплуатации.</p>
    <p>4.3. Гарантийное обслуживание осуществляется бесплатно в течение гарантийного срока.</p>
  </div>

  <h2>5. ПРАВА И ОБЯЗАННОСТИ СТОРОН</h2>
  <div class="section">
    <p><strong>5.1. Исполнитель обязуется:</strong></p>
    <p>&nbsp;&nbsp;&nbsp;— выполнить работы качественно, в соответствии с технологией монтажа;</p>
    <p>&nbsp;&nbsp;&nbsp;— использовать материалы надлежащего качества;</p>
    <p>&nbsp;&nbsp;&nbsp;— устранить дефекты, выявленные при приёмке;</p>
    <p>&nbsp;&nbsp;&nbsp;— убрать за собой строительный мусор.</p>
    <p><strong>5.2. Заказчик обязуется:</strong></p>
    <p>&nbsp;&nbsp;&nbsp;— обеспечить доступ к помещению в согласованное время;</p>
    <p>&nbsp;&nbsp;&nbsp;— произвести оплату в установленном порядке;</p>
    <p>&nbsp;&nbsp;&nbsp;— принять работы и подписать Акт выполненных работ.</p>
  </div>

  <h2>6. ОТВЕТСТВЕННОСТЬ СТОРОН</h2>
  <div class="section">
    <p>6.1. За нарушение сроков выполнения работ Исполнитель уплачивает неустойку в размере
    0,1% от стоимости работ за каждый день просрочки, но не более 10% от общей суммы.</p>
    <p>6.2. За нарушение сроков оплаты Заказчик уплачивает неустойку в размере
    0,1% от неоплаченной суммы за каждый день просрочки.</p>
  </div>

  <h2>7. ФОРС-МАЖОР</h2>
  <div class="section">
    <p>7.1. Стороны освобождаются от ответственности за неисполнение обязательств,
    если оно вызвано обстоятельствами непреодолимой силы (стихийные бедствия,
    действия государственных органов и т.д.).</p>
  </div>

  <h2>8. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ</h2>
  <div class="section">
    <p>8.1. Настоящий ${isIp ? "Договор" : "Соглашение"} вступает в силу с момента подписания и
    действует до полного исполнения Сторонами своих обязательств.</p>
    <p>8.2. Все споры решаются путём переговоров, а при недостижении согласия —
    в судебном порядке по месту нахождения ответчика.</p>
    <p>8.3. ${isIp ? "Договор" : "Соглашение"} составлен(-о) в двух экземплярах, имеющих
    одинаковую юридическую силу, по одному для каждой из Сторон.</p>
  </div>

  <h2>9. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</h2>
  <div class="sign-block">
    <div class="sign-col">
      ${executorReqs}
    </div>
    <div class="sign-col">
      ${clientReqs}
    </div>
  </div>

  <p style="font-size:10px;color:#999;text-align:center;margin-top:40px;">
    Документ сформирован в PotolokAI
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
  calc: CalculationResult
): string {
  const contractNum = estimate.publicId.slice(0, 8).toUpperCase();
  const today = fmtDate(new Date());
  const city = esc(master.contractCity) || "_______________";
  const total = estimate.total;
  const roomResults = getRoomResults(calc);
  const worksRows = buildWorksTable(roomResults);

  const masterName = esc(getMasterName(master));
  const clientName = esc(estimate.clientName) || "___________________________";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт выполненных работ №${contractNum}</title>
  <style>${pageStyle}</style>
</head>
<body>
  <h1>АКТ ВЫПОЛНЕННЫХ РАБОТ</h1>
  <p class="center">к ${master.contractType === "ip" ? "Договору" : "Соглашению"} № ${contractNum}</p>
  <p class="center">${today}, ${city}</p>

  <div class="parties">
    <p>Исполнитель: <strong>${masterName}</strong></p>
    <p>Заказчик: <strong>${clientName}</strong></p>
  </div>

  <div class="section">
    <p>Исполнитель выполнил, а Заказчик принял следующие работы:</p>

    <table>
      <thead>
        <tr>
          <th style="${thStyle} width:30px;">№</th>
          <th style="${thStyle}">Наименование</th>
          <th style="${thStyle} width:50px;">Кол.</th>
          <th style="${thStyle} width:50px;">Ед.</th>
          <th style="${thStyle} width:80px;">Цена</th>
          <th style="${thStyle} width:90px;">Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${worksRows}
      </tbody>
    </table>

    <p style="text-align:right;margin-top:8px;">
      <strong>ИТОГО: ${fmtPrice(total)}</strong>
    </p>
  </div>

  <div class="section">
    <p>Вышеперечисленные работы выполнены в полном объёме и в установленные сроки.
    Заказчик претензий по объёму, качеству и срокам выполнения работ не имеет.</p>
    <p>Общая стоимость выполненных работ составляет: <strong>${fmtPrice(total)}</strong>
    (${numberToWordsKz(total)}).</p>
  </div>

  <div class="sign-block">
    <div class="sign-col">
      <p><strong>Исполнитель:</strong></p>
      <p>${masterName}</p>
      <p>Тел: ${esc(getMasterPhone(master))}</p>
      <br>
      <p>Подпись ________________</p>
      <p style="font-size:11px;color:#666;">Дата: ${today}</p>
    </div>
    <div class="sign-col">
      <p><strong>Заказчик:</strong></p>
      <p>${clientName}</p>
      <p>Тел: ${esc(estimate.clientPhone) || "_______________"}</p>
      <br>
      <p>Подпись ________________</p>
      <p style="font-size:11px;color:#666;">Дата: _______________</p>
    </div>
  </div>

  <p style="font-size:10px;color:#999;text-align:center;margin-top:40px;">
    Документ сформирован в PotolokAI
  </p>
</body>
</html>`;
}

// ============================================
// Helpers
// ============================================

function yearWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "год";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "года";
  return "лет";
}

function numberToWordsKz(amount: number): string {
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
    tText = tText.replace(/\bодин$/, "одна").replace(/\bдва$/, "две");
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
