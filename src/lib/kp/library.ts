import { prisma } from "@/lib/prisma";
import { KIND_INFO, type KpKind } from "./kinds";

/**
 * Подбор фото для страницы «Как это будет выглядеть» в КП.
 *
 * Приоритет: фото мастера к позиции прайса (PriceVariant.photoUrl, уже лежит
 * в строке расчёта) → наша библиотека (KpLibraryPhoto) → без фото (тип просто
 * не показывается, пустых рамок нет).
 *
 * Из библиотеки фото выбирается «случайно, но навсегда»: seed = id КП, у
 * одного клиента всегда одна и та же картинка, у разных КП — разные.
 */

export type GalleryPhoto = {
  kind: KpKind;
  label: string;
  caption: string;
  url: string;
  /** true — фото мастера (из его прайса), false — из библиотеки */
  own: boolean;
};

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function pickGalleryPhotos(
  kinds: KpKind[],
  ownByKind: Partial<Record<KpKind, string>>,
  seed: string,
): Promise<GalleryPhoto[]> {
  if (kinds.length === 0) return [];
  const need = kinds.filter((k) => !ownByKind[k]);
  const rows = need.length
    ? await prisma.kpLibraryPhoto.findMany({
        where: { kind: { in: need }, active: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { kind: true, url: true },
      })
    : [];
  const byKind = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byKind.get(r.kind) ?? [];
    arr.push(r.url);
    byKind.set(r.kind, arr);
  }
  const out: GalleryPhoto[] = [];
  for (const kind of kinds) {
    const info = KIND_INFO[kind];
    const own = ownByKind[kind];
    if (own) {
      out.push({ kind, label: info.label, caption: info.caption, url: own, own: true });
      continue;
    }
    const urls = byKind.get(kind);
    if (!urls || urls.length === 0) continue;
    const idx = hash32(`${seed}:${kind}`) % urls.length;
    out.push({ kind, label: info.label, caption: info.caption, url: urls[idx], own: false });
  }
  return out;
}
