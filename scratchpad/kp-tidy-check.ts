// Проверка «уборки» софитов на реальных замерах: сколько комнат тронуто и как
import { prisma } from "@/lib/prisma";
import { planRoomOf } from "@/lib/kp/pdf-data";
import { tidyPlanForClient } from "@/lib/kp/plan-tidy";
async function main() {
  const since = new Date(Date.now() - 60 * 864e5);
  const list = await prisma.estimate.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { publicId: true, roomsData: true } });
  let rooms = 0, changed = 0, maxShift = 0, grids = 0; const samples: {shift:number;line:string}[] = [];
  for (const e of list) for (const raw of (Array.isArray(e.roomsData) ? e.roomsData as any[] : [])) {
    const room = planRoomOf(raw); if (!room) continue;
    const spots = (room.elements as any[] ?? []).filter((x) => x.type === "spot"); if (spots.length < 2) continue;
    rooms++;
    const t = tidyPlanForClient(room);
    if (t === room) continue;
    changed++;
    const before = spots.map((s) => [s.x, s.y]); const after = (t.elements as any[]).filter((x) => x.type === "spot").map((s) => [s.x, s.y]);
    const shift = Math.max(...before.map((b, i) => Math.hypot(b[0] - after[i][0], b[1] - after[i][1])));
    maxShift = Math.max(maxShift, shift);
    samples.push({ shift, line: `${e.publicId.slice(0,8)} ${raw.name} n=${spots.length} shift=${shift.toFixed(0)}см ${JSON.stringify(before.map(p=>p.map(Math.round)))} -> ${JSON.stringify(after.map(p=>p.map(Math.round)))}` });
  }
  console.log({ rooms, changed, maxShift: Math.round(maxShift), over60: samples.filter(s=>s.shift>60).length }); samples.sort((a,b)=>b.shift-a.shift).slice(0,6).forEach((s) => console.log(s.line.slice(0,400)));
  await prisma.$disconnect();
}
main();
