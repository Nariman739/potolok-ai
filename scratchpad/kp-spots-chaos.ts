import { prisma } from "@/lib/prisma";
// Насколько софиты в замерах стоят рядами: для каждой комнаты с ≥3 софитами
// считаем, укладываются ли центры в ряды/колонки с допуском.
function rows(vals: number[], tol: number): number[][] {
  const s = [...vals].sort((a, b) => a - b); const groups: number[][] = [];
  for (const v of s) { const g = groups[groups.length - 1]; if (g && v - g[g.length - 1] <= tol) g.push(v); else groups.push([v]); }
  return groups;
}
async function main() {
  const since = new Date(Date.now() - 60 * 864e5);
  const list = await prisma.estimate.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { roomsData: true, master: { select: { phone: true } } } });
  const stat = { rooms: 0, tidy: 0, almost: 0, chaos: 0, mine: { rooms: 0, tidy: 0, almost: 0, chaos: 0 } };
  for (const e of list) {
    const rooms = Array.isArray(e.roomsData) ? (e.roomsData as any[]) : [];
    const mine = e.master.phone?.includes("77003339193") || e.master.phone?.includes("7700") && false;
    for (const r of rooms) {
      const spots = (r.elements ?? []).filter((x: any) => x.type === "spot" && typeof x.x === "number");
      if (spots.length < 3) continue;
      const w = Math.max(...(r.walls ?? [100]));
      const xs = spots.map((s: any) => s.x), ys = spots.map((s: any) => s.y);
      const score = (tol: number) => {
        const rx = rows(xs, tol), ry = rows(ys, tol);
        // ряды «хорошие», если число групп заметно меньше числа софитов
        return rx.length * ry.length <= spots.length * 1.5 && Math.max(rx.length, ry.length) < spots.length;
      };
      const bucket = score(5) ? "tidy" : score(Math.max(15, w * 0.05)) ? "almost" : "chaos";
      stat.rooms++; (stat as any)[bucket]++;
      if (mine) { stat.mine.rooms++; (stat.mine as any)[bucket]++; }
    }
  }
  console.log(JSON.stringify(stat));
  await prisma.$disconnect();
}
main();
