import { prisma } from "@/lib/prisma";

export type OwnerLegalInfo = {
  legalName: string;        // ИП «Жаминов» или ФИО полностью
  bin: string | null;       // БИН (для ИП)
  iin: string | null;       // ИИН (физлица или ИП)
  legalAddress: string;     // юридический адрес
  bankName: string | null;
  iban: string | null;
  kbe: string | null;
  bik: string | null;
  phone: string;
  email: string;
  contractCity: string;
};

const DEFAULTS = {
  legalName: "ИП Жаминов Нариман",
  legalAddress: "Республика Казахстан, г. Астана",
  contractCity: "Астана",
  phone: "+7 700 000 0000",
  email: "support@potolok.ai",
} as const;

/**
 * Реквизиты владельца сервиса (для оферты, политики, контактов).
 * Тянутся из Master с isOwner=true. Если такого нет — возвращаем дефолты-плейсхолдеры.
 */
export async function getOwnerLegalInfo(): Promise<OwnerLegalInfo> {
  const owner = await prisma.master.findFirst({
    where: { isOwner: true },
    select: {
      firstName: true,
      lastName: true,
      companyName: true,
      legalName: true,
      bin: true,
      iin: true,
      legalAddress: true,
      bankName: true,
      iban: true,
      kbe: true,
      bik: true,
      phone: true,
      email: true,
      contractCity: true,
    },
  });

  if (!owner) {
    return {
      ...DEFAULTS,
      bin: null,
      iin: null,
      bankName: null,
      iban: null,
      kbe: null,
      bik: null,
    };
  }

  const fullName = [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim();
  const legalName = owner.legalName
    || owner.companyName
    || (fullName ? `ИП «${fullName}»` : DEFAULTS.legalName);

  return {
    legalName,
    bin: owner.bin,
    iin: owner.iin,
    legalAddress: owner.legalAddress || DEFAULTS.legalAddress,
    bankName: owner.bankName,
    iban: owner.iban,
    kbe: owner.kbe,
    bik: owner.bik,
    phone: owner.phone || DEFAULTS.phone,
    email: owner.email || DEFAULTS.email,
    contractCity: owner.contractCity || DEFAULTS.contractCity,
  };
}
