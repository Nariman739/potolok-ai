// Починка HEIC-файлов под именем .jpg в Vercel Blob (27.10.2026): скачать,
// сконвертировать на Mac через sips (HEIC → JPEG 1600px), залить ПОВЕРХ по тому
// же пути (URL в базе не меняется). Оригиналы — в ~/Desktop/kp-heic-backup/.
//   npx tsx --env-file=.env.local scratchpad/kp-heic-fix.ts <файл со списком URL>
import { put } from "@vercel/blob";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const urls = fs.readFileSync(process.argv[2], "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const backup = path.join(os.homedir(), "Desktop", "kp-heic-backup");
  fs.mkdirSync(backup, { recursive: true });
  let ok = 0, fail = 0;
  for (const url of urls) {
    const pathname = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    const name = pathname.replace(/\//g, "_");
    const src = path.join(backup, name.replace(/\.jpg$/i, ".heic"));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(4, 8).toString("latin1") !== "ftyp") { console.log("skip (не HEIC):", url); continue; }
      fs.writeFileSync(src, buf);
      const out = path.join(os.tmpdir(), name);
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1600", src, "--out", out], { stdio: "ignore" });
      const jpg = fs.readFileSync(out);
      if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error("sips не дал JPEG");
      const blob = await put(pathname, jpg, { access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
      if (blob.url !== url) console.log("  ! URL изменился:", blob.url);
      ok++;
      console.log("+", Math.round(buf.length / 1024), "KB →", Math.round(jpg.length / 1024), "KB", pathname);
    } catch (e) {
      fail++;
      console.log("x", url, (e as Error).message);
    }
  }
  console.log({ ok, fail });
}
main();
