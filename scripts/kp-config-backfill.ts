/**
 * Переносит результат конструктора КП из брифа в сам профиль мастера.
 *
 * До автосохранения (12.09.2026) результат AI писался только в MasterBrief, а
 * КП рендерится из Master.kpConfig. Мастера, которые прошли семь шагов, но не
 * доскроллили до кнопки «Сохранить настройки КП», отправляли клиентам дефолтное
 * КП — при зелёной галочке «дизайн настроен» в чек-листе.
 *
 * Запуск:  npx tsx --env-file=.env.local scripts/kp-config-backfill.ts          (dry-run)
 *          npx tsx --env-file=.env.local scripts/kp-config-backfill.ts --apply
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma: any = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
} as any);
const APPLY = process.argv.includes("--apply");

async function main() {
  const briefs = await prisma.masterBrief.findMany({
    select: {
      masterId: true,
      generatedConfig: true,
      generatedTagline: true,
      master: { select: { phone: true, companyName: true, kpConfig: true, tagline: true } },
    },
  });

  const targets = briefs.filter((b: any) => b.generatedConfig && !b.master?.kpConfig);

  console.log(`Прошли конструктор КП: ${briefs.length}`);
  console.log(`Из них КП осталось дефолтным (конфиг не применён): ${targets.length}`);
  for (const t of targets) {
    console.log(`  ${t.master.phone} | ${t.master.companyName ?? "-"} | тема ${(t.generatedConfig as any)?.template ?? "?"}`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Запусти с --apply чтобы применить.");
    return;
  }

  for (const t of targets) {
    await prisma.master.update({
      where: { id: t.masterId },
      data: {
        kpConfig: t.generatedConfig,
        // Слоган ставим, только если мастер не написал свой.
        ...(t.generatedTagline && !t.master.tagline ? { tagline: t.generatedTagline } : {}),
      },
    });
  }
  console.log(`\nГотово: КП настроено у ${targets.length} мастеров.`);
}

main()
  .catch((e) => console.error("ERR", e))
  .finally(async () => {
    await prisma.$disconnect();
  });
