// DEV-ONLY: приёмник snapshot+mask из /vision-capture для покадровой отладки
// каждого элемента потолка. Пишет PNG в /tmp/cap_<name>_{scene,mask}.png.
// В production отвечает 404 — маршрут не должен существовать на проде.

import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";

function decode(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return Buffer.from(m ? m[1] : dataUrl, "base64");
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { name, scene, mask, floating } = (await request.json()) as {
    name?: string;
    scene?: string;
    mask?: string;
    floating?: string;
  };
  const safe = (name ?? "cap").replace(/[^a-z0-9_-]/gi, "");
  const out: string[] = [];
  if (scene) {
    const p = join(tmpdir(), `cap_${safe}_scene.png`);
    await writeFile(p, decode(scene));
    out.push(p);
  }
  if (mask) {
    const p = join(tmpdir(), `cap_${safe}_mask.png`);
    await writeFile(p, decode(mask));
    out.push(p);
  }
  if (floating) {
    const p = join(tmpdir(), `cap_${safe}_floating.png`);
    await writeFile(p, decode(floating));
    out.push(p);
  }
  console.log(`[vision-capture-dev] saved ${safe}:`, out.join(", "));
  return NextResponse.json({ ok: true, files: out });
}
