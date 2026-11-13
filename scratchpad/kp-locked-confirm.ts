// CTL: перевести КП CTL-объекта QA RU в CONFIRMED (имитация «приняли на сайте»).
import { prisma } from "@/lib/prisma";
const keep = setInterval(() => {}, 1000);
(async () => {
  const [id] = process.argv.slice(2);
  const e = await prisma.estimate.findFirst({ where: { id, measurementObject: { address: { startsWith: "CTL" } }, master: { phone: "+79990000077" } }, select: { id: true } });
  if (!e) console.log("не CTL");
  else console.log(await prisma.estimate.update({ where: { id }, data: { status: "CONFIRMED" }, select: { id: true, status: true } }));
  clearInterval(keep); process.exit(0);
})();
