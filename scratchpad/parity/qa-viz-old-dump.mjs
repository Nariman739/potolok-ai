import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";
const sql = neon(process.env.DATABASE_URL);
const out = process.argv[2];
const v = (await sql`select v.markup, r.url from "Visualization" v join "VisualizationRender" r on r."visualizationId"=v.id where v.id='1d8033ef-13b4-4b83-8b23-ba48de900993' order by r."createdAt" desc limit 1`)[0];
const m = v.markup;
writeFileSync(`${out}/old-snapshot.json`, JSON.stringify({ snapshot: m.snapshot, presets: m.presets, kelvin: m.kelvin, lightTempKey: m.lightTempKey, floorPresetId: m.floorPresetId, wallPresetId: m.wallPresetId, colorHex: m.colorHex, colorName: m.colorName, floorPromptDesc: m.floorPromptDesc, wallPromptDesc: m.wallPromptDesc, lightTempPromptHint: m.lightTempPromptHint, oldRender: v.url, oldFloatingMask: m.floatingMaskUrl, oldCeilingMask: m.ceilingMaskUrl, oldOriginal: null }, null, 1));
console.log("snapshot vertices:", JSON.stringify(m.snapshot?.vertices), "ceiling:", m.snapshot?.ceilingHeight, "wp:", JSON.stringify(m.snapshot?.wallProfiles), "els:", m.snapshot?.elements?.length, "presets:", JSON.stringify(m.presets), "frame:", JSON.stringify(m.frameSize));
for (const [k, u] of [["было-ai-2026-10-09.jpg", v.url], ["было-floatingMask.png", m.floatingMaskUrl], ["было-ceilingMask.png", m.ceilingMaskUrl]]) {
  if (!u) continue;
  const b = Buffer.from(await (await fetch(u)).arrayBuffer());
  writeFileSync(`${out}/${k}`, b);
  console.log("saved", k, b.length);
}
