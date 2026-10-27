import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildPdfData } from "@/lib/kp/pdf-data";
import fs from "node:fs";
async function main() {
  const out = process.argv[2];
  for (const pub of process.argv.slice(3)) {
    const e = await prisma.estimate.findFirst({ where: { OR: [{ publicId: { startsWith: pub } }, { id: { startsWith: pub } }] }, select: { id: true } });
    if (!e) { console.log("no", pub); continue; }
    const data = await buildPdfData(e.id);
    if (process.env.KP_VIEW === "detailed" || process.env.KP_VIEW === "summary") data.estimate.priceView = process.env.KP_VIEW;
    const buf = await renderToBuffer(KpDocument({ data }));
    fs.writeFileSync(`${out}/real-${pub.slice(0, 8)}.pdf`, buf);
    console.log("ok", pub.slice(0, 8), buf.length);
  }
  await prisma.$disconnect();
}
main();
