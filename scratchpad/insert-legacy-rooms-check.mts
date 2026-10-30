// Ревью 30.10.2026: старые замеры в проде со стенами pvc_insert / pvc / aluminum_insert —
// что показывает чертёж наряда (строки «что ставить») после «багет и вставка отдельно».
// env $(grep -E '^DATABASE_URL' .env.local | xargs) npx tsx --tsconfig tsconfig.json scratchpad/insert-legacy-rooms-check.mts
import { prisma } from "@/lib/prisma";
import { buildWorkOrderModel, loadWorkOrderById } from "@/lib/work-order-data";

const rooms = await prisma.measurementRoom.findMany({
  where: { object: { deletedAt: null } },
  select: { id: true, objectId: true, name: true, wallProfiles: true, withInsert: true, object: { select: { masterId: true, noInsert: true, workOrderToken: true } } },
  orderBy: { createdAt: "desc" },
  take: 2000,
});
const kinds = { pvc_insert: 0, pvc: 0, aluminum_insert: 0, aluminum: 0, galtel: 0, no_insert: 0, mixed: 0, none: 0 };
const samples: Record<string, typeof rooms[number]> = {};
for (const r of rooms) {
  const vals = r.wallProfiles && typeof r.wallProfiles === "object" ? Object.values(r.wallProfiles as Record<string, unknown>) : [];
  const has = (k: string) => vals.includes(k);
  const legacy = ["pvc_insert", "pvc", "aluminum_insert", "aluminum", "galtel", "no_insert"].filter(has);
  if (legacy.length === 0) { kinds.none++; continue; }
  if (has("pvc") && vals.some((v) => v !== "pvc" && typeof v === "string")) kinds.mixed++;
  for (const k of legacy) { (kinds as Record<string, number>)[k]++; samples[k] ??= r; }
  if (legacy.includes("pvc") && vals.every((v) => v === "pvc")) samples["pvc_all"] ??= r;
}
console.log("комнат:", rooms.length, kinds);

for (const [k, r] of Object.entries(samples)) {
  const obj = await loadWorkOrderById(r.objectId, [r.object.masterId]);
  if (!obj) continue;
  const model = await buildWorkOrderModel(obj);
  const room = model.rooms.find((x) => x.id === r.id);
  console.log(`\n[${k}] объект ${r.objectId} комната «${r.name}» wallProfiles=${JSON.stringify(r.wallProfiles)} withInsert=${r.withInsert} noInsert=${r.object.noInsert} token=${r.object.workOrderToken ?? "—"}`);
  for (const l of room?.lines ?? []) console.log("   ", l);
}
await prisma.$disconnect();
