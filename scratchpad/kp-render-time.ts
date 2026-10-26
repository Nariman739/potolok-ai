import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildPdfData } from "@/lib/kp/pdf-data";
async function main() {
  for (const pub of process.argv.slice(2)) {
    const e = await prisma.estimate.findFirst({ where: { publicId: pub }, select: { id: true } });
    if (!e) continue;
    const t0 = Date.now(); const data = await buildPdfData(e.id); const t1 = Date.now();
    for (const style of ["notebook", "drawing", "blueprint"] as const) {
      data.config.planStyle = style;
      const s = Date.now(); const buf = await renderToBuffer(KpDocument({ data })); 
      console.log(pub.slice(0, 8), style, "render", Date.now() - s, "ms", Math.round(buf.length / 1024), "KB", "(data", t1 - t0, "ms)");
    }
  }
  await prisma.$disconnect();
}
main();
