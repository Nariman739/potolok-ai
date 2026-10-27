import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { prisma } from "@/lib/prisma";
async function main() {
  let t = Date.now();
  const data = await buildMockPdfData({ template: "minimal", master: { coverPhotoUrl: null } });
  console.log("data", Date.now() - t, "ms; gallery", data.gallery.length, "portfolio", data.portfolio.length);
  t = Date.now(); let buf = await renderToBuffer(KpDocument({ data })); console.log("render full", Date.now() - t, "ms", Math.round(buf.length / 1024), "KB");
  const g = data.gallery; data.gallery = [];
  t = Date.now(); buf = await renderToBuffer(KpDocument({ data })); console.log("render no gallery", Date.now() - t, "ms", Math.round(buf.length / 1024), "KB");
  data.gallery = g; data.portfolio = [];
  t = Date.now(); buf = await renderToBuffer(KpDocument({ data })); console.log("render no portfolio", Date.now() - t, "ms", Math.round(buf.length / 1024), "KB");
  data.gallery = []; 
  t = Date.now(); buf = await renderToBuffer(KpDocument({ data })); console.log("render no images", Date.now() - t, "ms", Math.round(buf.length / 1024), "KB");
  // размер картинок библиотеки
  const rows = await prisma.kpLibraryPhoto.findMany({ select: { url: true, width: true, height: true, kind: true } });
  for (const r of rows.slice(0, 20)) { const h = await fetch(r.url, { method: "HEAD" }); console.log(r.kind, r.width + "x" + r.height, h.headers.get("content-length"), "B"); }
  await prisma.$disconnect();
}
main();
