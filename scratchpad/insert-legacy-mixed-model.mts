// Ревью 30.10.2026: комнаты «часть стен pvc, остальные без ключа» → в модели наряда должна быть «Вставка».
// env $(grep -E '^DATABASE_URL' .env.local | xargs) npx tsx --tsconfig tsconfig.json scratchpad/insert-legacy-mixed-model.mts
import { prisma } from "@/lib/prisma";
import { loadWorkOrderById, buildWorkOrderModel } from "@/lib/work-order-data";

const rooms = await prisma.measurementRoom.findMany({
  where: { object: { deletedAt: null } },
  select: { id: true, objectId: true, name: true, walls: true, wallProfiles: true, object: { select: { masterId: true } } },
});
let shown = 0;
for (const r of rooms) {
  const wp = (r.wallProfiles ?? {}) as Record<string, string>;
  const vals = Object.values(wp);
  const n = (r.walls as number[]).length;
  if (!vals.includes("pvc") || Object.keys(wp).length >= n) continue;
  const obj = await loadWorkOrderById(r.objectId, [r.object.masterId]);
  if (!obj) continue;
  const model = await buildWorkOrderModel(obj);
  const room = model.rooms.find((x) => x.id === r.id);
  console.log(`«${r.name}» стен ${n} ${JSON.stringify(wp)} →`, room?.lines.filter((l) => /Вставка|Профиль/.test(l)));
  if (++shown >= 4) break;
}
console.log("показано:", shown);
await prisma.$disconnect();
