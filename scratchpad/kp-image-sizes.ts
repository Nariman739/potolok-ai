// Какие картинки раздувают PDF: все URL из PdfData + их размер/тип по HEAD.
//   npx tsx --env-file=.env.local scratchpad/kp-image-sizes.ts <publicId…>
import { prisma } from "@/lib/prisma";
import { buildPdfData } from "@/lib/kp/pdf-data";
async function main() {
  for (const pub of process.argv.slice(2)) {
    const e = await prisma.estimate.findFirst({ where: { publicId: { startsWith: pub } }, select: { id: true } });
    if (!e) { console.log("no", pub); continue; }
    const d = await buildPdfData(e.id);
    const urls: [string, string | null][] = [
      ["logo", d.master.logoUrl], ["cover", d.master.coverPhotoUrl], ["3d", d.estimate.room3dPreviewUrl],
      ...d.portfolio.map((p, i) => [`portfolio${i}`, p.photoUrl] as [string, string | null]),
      ...d.gallery.map((g) => [`gallery:${g.kind}${g.own ? "*" : ""}`, g.url] as [string, string | null]),
      ...d.estimate.rooms.flatMap((r) => r.items.filter((it) => it.photoUrl).map((it) => [`item:${it.name.slice(0, 20)}`, it.photoUrl!] as [string, string | null])),
    ];
    console.log(`\n== ${pub} ${d.config.template} rooms=${d.estimate.rooms.length}`);
    let total = 0;
    for (const [k, u] of urls) {
      if (!u) continue;
      try {
        const h = await fetch(u, { method: "HEAD" });
        const len = Number(h.headers.get("content-length") ?? 0); total += len;
        console.log(`  ${k.padEnd(22)} ${String(Math.round(len / 1024)).padStart(6)} KB  ${h.headers.get("content-type")}  ${u.slice(0, 90)}`);
      } catch (err) { console.log(`  ${k} HEAD fail ${(err as Error).message} ${u.slice(0, 90)}`); }
    }
    console.log(`  total images ${Math.round(total / 1024)} KB`);
  }
  await prisma.$disconnect();
}
main();
