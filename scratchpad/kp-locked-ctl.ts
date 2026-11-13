// CTL для проверки «принятое КП заморожено» на QA RU (+79990000077). ПИШЕТ В ПРОД — только CTL.
//   create → объект «CTL заморозка — удалить» + КП CONFIRMED (копия расчёта последнего КП QA RU)
//   delete <objectId> → все КП этого объекта (вкл. сделанные приложением варианты) + объект
import { prisma } from "@/lib/prisma";
const keep = setInterval(() => {}, 1000);
const [cmd, arg] = process.argv.slice(2);
(async () => {
  try {
    const qa = await prisma.master.findUnique({ where: { phone: "+79990000077" }, select: { id: true, activeCompanyId: true } });
    if (!qa) throw new Error("нет QA RU");
    if (cmd === "create") {
      // Образец расчёта — последнее КП из приложения у QA RU или QA KZ (только чтение)
      const src = await prisma.estimate.findFirst({ where: { master: { phone: { in: ["+79990000077", "+77000000077"] } }, deletedAt: null, totalArea: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { roomsData: true, calculationData: true, totalArea: true, total: true } });
      if (!src) throw new Error("нет КП-образца");
      const obj = await prisma.measurementObject.create({ data: { masterId: qa.id, companyId: qa.activeCompanyId, address: "CTL заморозка — удалить", status: "measured" } as never, select: { id: true } });
      const e = await prisma.estimate.create({ data: { masterId: qa.id, companyId: qa.activeCompanyId, measurementObjectId: obj.id, clientName: "CTL Заморозка", roomsData: src.roomsData ?? [], calculationData: src.calculationData ?? {}, totalArea: src.totalArea, total: src.total, status: "CONFIRMED" } as never, select: { id: true } });
      console.log(JSON.stringify({ objectId: obj.id, estimateId: e.id, total: src.total }));
    } else if (cmd === "delete" && arg) {
      const obj = await prisma.measurementObject.findFirst({ where: { id: arg, masterId: qa.id, address: { startsWith: "CTL" } }, select: { id: true } });
      if (!obj) throw new Error("не CTL-объект QA RU");
      const es = await prisma.estimate.findMany({ where: { measurementObjectId: obj.id }, select: { id: true } });
      await prisma.estimate.deleteMany({ where: { id: { in: es.map((x) => x.id) } } });
      await prisma.measurementObject.delete({ where: { id: obj.id } });
      console.log("удалены КП", es.map((x) => x.id), "объект", obj.id);
    } else if (cmd === "contract" && arg) {
      // CTL-КП объекта «CTL…» QA RU: неподписанный договор (или подписанный — 3-й аргумент signed)
      const e = await prisma.estimate.findFirst({ where: { id: arg, master: { phone: "+79990000077" }, measurementObject: { address: { startsWith: "CTL" } } }, select: { id: true } });
      if (!e) throw new Error("не CTL");
      const signed = process.argv[4] === "signed";
      await prisma.estimate.update({ where: { id: arg }, data: { contractPublicId: `ctl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, contractCreatedAt: new Date(), contractTextSnapshot: {}, ...(signed && { contractSignedAt: new Date(), contractSignerName: "CTL" }) } });
      console.log("договор", signed ? "подписан" : "создан", arg);
    } else if (cmd === "list" && arg) {
      console.log(JSON.stringify(await prisma.estimate.findMany({ where: { measurementObjectId: arg }, select: { id: true, status: true, total: true, createdAt: true, discountAmount: true } })));
    }
  } catch (err) { console.log("ERR", err); }
  clearInterval(keep); process.exit(0);
})();
