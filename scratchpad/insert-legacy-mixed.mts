// Ревью 30.10.2026: старые комнаты, где часть стен помечена «pvc» (без вставки по-старому),
// а остальные стены без метки (по-старому = со вставкой). legacyInsertFlag для них даёт false.
// env $(grep -E '^DATABASE_URL' .env.local | xargs) npx tsx --tsconfig tsconfig.json scratchpad/insert-legacy-mixed.mts
import { prisma } from "@/lib/prisma";

const rooms = await prisma.measurementRoom.findMany({
  where: { object: { deletedAt: null } },
  select: { id: true, objectId: true, name: true, walls: true, wallProfiles: true, createdAt: true, object: { select: { masterId: true, address: true } } },
});
let allPvc = 0, partialPvc = 0, partialWithOther = 0;
const masters = new Set<string>();
const examples: string[] = [];
for (const r of rooms) {
  const wp = r.wallProfiles && typeof r.wallProfiles === "object" ? (r.wallProfiles as Record<string, string>) : {};
  const vals = Object.values(wp);
  if (!vals.includes("pvc") && !vals.includes("no_insert")) continue;
  const n = (r.walls as number[]).length;
  const marked = Object.keys(wp).length;
  const pvcCount = vals.filter((v) => v === "pvc" || v === "no_insert").length;
  if (pvcCount === n) { allPvc++; continue; }
  if (marked < n) {
    partialPvc++;
    masters.add(r.object.masterId);
    if (examples.length < 8) examples.push(`${r.createdAt.toISOString().slice(0, 10)} ${r.object.address ?? r.objectId} «${r.name}» стен ${n}, pvc ${pvcCount}, помечено ${marked}: ${JSON.stringify(wp)}`);
  } else partialWithOther++;
}
console.log({ всего: rooms.length, allPvc, partialPvc_absentWalls: partialPvc, partialWithOther, мастеров: masters.size });
for (const e of examples) console.log("  ", e);
await prisma.$disconnect();
