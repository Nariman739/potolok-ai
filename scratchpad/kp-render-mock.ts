import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildMockPdfData } from "@/lib/kp/mock-data";
import { getDefaultConfigForTemplate } from "@/lib/kp/templates";
import { ALL_TEMPLATES } from "@/lib/kp/themes";
import fs from "node:fs";
async function main() {
  const out = process.argv[2];
  for (const template of ALL_TEMPLATES) {
    const config = getDefaultConfigForTemplate(template);
    const data = await buildMockPdfData({ template, config, master: { coverPhotoUrl: "" } });
    if (template === "bold-color") data.estimate.priceView = "summary";
    const buf = await renderToBuffer(KpDocument({ data }));
    fs.writeFileSync(`${out}/mock-${template}.pdf`, buf);
    console.log("ok", template, buf.length);
  }
}
main();
