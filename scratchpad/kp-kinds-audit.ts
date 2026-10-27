// Названия позиций за 60 дней → тип фото (ищем ложные срабатывания).
import { prisma } from "@/lib/prisma";
import { kindFromItemName } from "@/lib/kp/kinds";
async function main() {
  const since = new Date(Date.now() - 60 * 864e5);
  const all = await prisma.estimate.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { calculationData: true } });
  const names = new Map<string, number>();
  for (const e of all) {
    const c = e.calculationData as { roomResults?: { items?: { itemName?: string }[] }[]; extraItems?: { itemName?: string; name?: string }[] } | null;
    for (const it of [...(c?.roomResults ?? []).flatMap((r) => r.items ?? []), ...(c?.extraItems ?? [])]) {
      const n = (it as { itemName?: string; name?: string }).itemName ?? (it as { name?: string }).name; if (!n) continue;
      names.set(n, (names.get(n) ?? 0) + 1);
    }
  }
  const byKind = new Map<string, [string, number][]>();
  for (const [n, c] of names) { const k = kindFromItemName(n) ?? "(нет)"; const arr = byKind.get(k) ?? []; arr.push([n, c]); byKind.set(k, arr); }
  console.log("уникальных названий:", names.size, "КП:", all.length);
  for (const [k, arr] of [...byKind].sort()) {
    arr.sort((a, b) => b[1] - a[1]);
    console.log(`\n[${k}] ${arr.length}`);
    for (const [n, c] of arr.slice(0, k === "(нет)" ? 70 : 45)) console.log(`   ${String(c).padStart(4)}  ${n}`);
  }
  await prisma.$disconnect();
}
main();
