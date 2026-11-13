/**
 * Какие реквизиты мастера нужны, чтобы договор получился полноценным.
 *
 * Шаблон договора терпит пустые поля (просто не выводит строку), но клиенту
 * уезжает документ без БИН и адреса. Поэтому мы не запрещаем создание, а
 * показываем мастеру, чего не хватает, и ведём в профиль.
 */
export type ContractRequisites = {
  contractType?: string | null;
  bin?: string | null;
  iin?: string | null;
  legalName?: string | null;
  legalAddress?: string | null;
  passportData?: string | null;
  contractCity?: string | null;
};

/**
 * Тип договора выбран? От этого зависят только печатные PDF «Договор»/«Акт» (их роуты без типа
 * отвечают 400). Электронный договор и акт создаются и показываются при любых реквизитах —
 * так всегда делали сервер и приложение; сайт до 13.11.2026 прятал за этим условием даже уже
 * созданный и подписанный договор (58 из 101 живого договора).
 */
export function isContractConfigured(m: ContractRequisites): boolean {
  return !!m.contractType && m.contractType !== "none";
}

/**
 * Человеческие названия незаполненных полей — прямо как они подписаны в профиле.
 * Для мастера из России (валюта RUB) — российские названия: ИНН, ОГРНИП, паспорт (27.10.2026).
 */
export function missingContractFields(m: ContractRequisites, currency?: string | null): string[] {
  const rf = currency === "RUB";
  const missing: string[] = [];
  // Тип не выбран — шаблон оформляет документ как от физического лица: перечисляем и его поля,
  // чтобы мастер видел, чего именно не будет в документе у клиента, а не одно «Тип договора».
  if (!isContractConfigured(m)) missing.push("Тип договора");

  if (m.contractType === "ip") {
    if (!m.bin && !m.iin) missing.push(rf ? "ОГРНИП или ИНН" : "БИН или ИИН");
    if (!m.legalName) missing.push("Наименование ИП");
    if (!m.legalAddress) missing.push("Юридический адрес");
  } else {
    if (!m.iin) missing.push(rf ? "ИНН" : "ИИН");
    if (!m.legalName) missing.push("ФИО полностью");
    if (!m.passportData) missing.push(rf ? "Паспорт" : "Удостоверение личности");
  }

  if (!m.contractCity) missing.push("Город (для шапки договора)");

  return missing;
}
