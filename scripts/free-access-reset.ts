/**
 * Снимает «истёкшую подписку» у мастеров на время бесплатного периода.
 *
 * Пока BILLING_ENABLED=false гейт всё равно не работает, но paidUntil в прошлом
 * оставляет мусорные баннеры и путает админку. Обнуляем paidUntil у тех, кому
 * он достался автоматически (trial 7d) и кто ни разу не платил.
 *
 * Тех, кто реально оплачивал (есть APPROVED-платёж) и Founder'ов не трогаем —
 * их оплаченные даты остаются в базе как есть.
 *
 * Запуск:  npx tsx --env-file=.env.local scripts/free-access-reset.ts        (dry-run)
 *          npx tsx --env-file=.env.local scripts/free-access-reset.ts --apply
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);
const APPLY = process.argv.includes("--apply");

async function main() {
  const now = new Date();

  const paidMasterIds = new Set(
    (
      await prisma.pendingPayment.findMany({
        where: { status: "APPROVED" },
        select: { masterId: true },
      })
    ).map((p) => p.masterId),
  );

  const candidates = await prisma.master.findMany({
    where: { paidUntil: { not: null }, isOwner: false, isFounder: false },
    select: { id: true, phone: true, firstName: true, paidUntil: true, billingNotes: true },
  });

  const targets = candidates.filter((m) => !paidMasterIds.has(m.id));
  const expired = targets.filter((m) => m.paidUntil! < now);

  console.log(`Кандидатов (не owner, не founder, без оплат): ${targets.length}`);
  console.log(`Из них с истёкшей датой (упирались в «оформите подписку»): ${expired.length}`);
  console.log(`Founder / оплатившие / owner — не трогаем.`);

  if (!APPLY) {
    console.log("\nDRY-RUN. Ничего не изменено. Запусти с --apply чтобы применить.");
    return;
  }

  // История не теряется: прежний срок уходит в billingNotes.
  let count = 0;
  for (const m of targets) {
    await prisma.master.update({
      where: { id: m.id },
      data: {
        paidUntil: null,
        billingNotes: `free period (был ${m.billingNotes ?? "trial"} до ${m.paidUntil!.toISOString().slice(0, 10)})`,
      },
    });
    count++;
  }
  console.log(`\nГотово: снят срок подписки у ${count} мастеров.`);
}

main()
  .catch((e) => console.error("ERR", e))
  .finally(async () => {
    await prisma.$disconnect();
  });
