// Гонка ensureOwnCompany (12.11.2026): временный CTL-мастер, 3 раунда по 6 параллельных вызовов →
// одна компания, один owner-участник, 0 исключений; CTL удаляется. ПИШЕТ В БАЗУ .env.local (прод)!
// npx tsx --env-file=.env.local scratchpad/company-race-check.ts
import { prisma } from "@/lib/prisma";
import { ensureOwnCompany } from "@/lib/company";
(async () => {
  const phone = "+79990001" + String(Date.now()).slice(-3);
  const m = await prisma.master.create({ data: { phone, passwordHash: "x", firstName: "CTL гонка 12.11 — удалить" } });
  console.log("CTL master", m.id, phone);
  let rc = 0;
  try {
    // 1) какой meta у P2002 при адаптере neon: две голые вставки
    await prisma.company.create({ data: { name: "ctl", ownerId: m.id } });
    try { await prisma.company.create({ data: { name: "ctl2", ownerId: m.id } }); } catch (e: any) { console.log("P2002 code", e.code, "meta", JSON.stringify(e.meta).slice(0, 300)); }
    await prisma.company.deleteMany({ where: { ownerId: m.id } });
    // 2) гонка: 6 параллельных вызовов, 3 раунда
    for (let round = 1; round <= 3; round++) {
      const res = await Promise.allSettled(Array.from({ length: 6 }, () => ensureOwnCompany(m.id)));
      const ok = res.filter((r) => r.status === "fulfilled").map((r: any) => r.value.id);
      const bad = res.filter((r) => r.status === "rejected").map((r: any) => String(r.reason).slice(0, 160));
      const companies = await prisma.company.findMany({ where: { ownerId: m.id }, include: { members: true } });
      const owners = companies.flatMap((c) => c.members.filter((x) => x.role === "owner"));
      const orphanMembers = await prisma.member.count({ where: { masterId: m.id, role: "owner" } });
      console.log(`round ${round}: fulfilled ${ok.length}, distinct ids ${new Set(ok).size}, rejected ${bad.length}`, bad, `| companies ${companies.length}, owner-members ${owners.length}, owner rows total ${orphanMembers}`);
      if (bad.length || new Set(ok).size !== 1 || companies.length !== 1 || owners.length !== 1 || orphanMembers !== 1) rc = 1;
      await prisma.member.deleteMany({ where: { masterId: m.id } });
      await prisma.company.deleteMany({ where: { ownerId: m.id } });
    }
  } finally {
    await prisma.member.deleteMany({ where: { masterId: m.id } });
    await prisma.company.deleteMany({ where: { ownerId: m.id } });
    await prisma.master.delete({ where: { id: m.id } });
    console.log("CTL deleted", m.id, "left:", await prisma.master.count({ where: { id: m.id } }));
  }
  console.log(rc ? "FAIL" : "PASS");
  process.exit(rc);
})();
