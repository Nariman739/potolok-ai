// Сколько фото портфолио/обложек/логотипов на самом деле HEIC под именем .jpg
import { prisma } from "@/lib/prisma";
async function sniff(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-15" } });
    const b = Buffer.from(await r.arrayBuffer());
    if (b.slice(4, 8).toString("latin1") === "ftyp") return "heic";
    if (b[0] === 0xff && b[1] === 0xd8) return "jpeg";
    if (b[0] === 0x89 && b[1] === 0x50) return "png";
    if (b.slice(0, 4).toString("latin1") === "RIFF") return "webp";
    return "other:" + b.slice(0, 4).toString("hex");
  } catch { return "err"; }
}
async function main() {
  const works = await prisma.portfolioWork.findMany({ where: { isPublished: true }, select: { id: true, photos: true } });
  const masters = await prisma.master.findMany({ where: { OR: [{ coverPhotoUrl: { not: null } }, { logoUrl: { not: null } }] }, select: { id: true, coverPhotoUrl: true, logoUrl: true } });
  const urls: [string, string][] = [];
  for (const w of works) for (const u of w.photos) urls.push(["portfolio", u]);
  for (const m of masters) { if (m.coverPhotoUrl) urls.push(["cover", m.coverPhotoUrl]); if (m.logoUrl) urls.push(["logo", m.logoUrl]); }
  const stats = new Map<string, number>();
  const heic: string[] = [];
  let i = 0;
  for (const [kind, u] of urls) {
    const t = await sniff(u);
    const k = `${kind}:${t}`; stats.set(k, (stats.get(k) ?? 0) + 1);
    if (t === "heic") heic.push(`${kind} ${u}`);
    if (++i % 50 === 0) console.log("…", i, "/", urls.length);
  }
  console.log(Object.fromEntries([...stats].sort()));
  console.log(heic.join("\n"));
  await prisma.$disconnect();
}
main();
