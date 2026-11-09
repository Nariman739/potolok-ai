/**
 * Договор во фрейме и обратно (09.11.2026).
 *
 * Текст договора — HTML-шаблон, юридический документ. Браузер, разобрав его,
 * пишет обратно уже другой HTML, поэтому правка вручную не пересобирает
 * документ: в исходнике меняются только те куски текста, которые человек
 * действительно поправил. Всё остальное остаётся байт-в-байт.
 */

const TAG_ATTR = "data-contract-tag";
const ROW_ATTR = "data-contract-row";
const PLACEHOLDER = /\{\s*([a-zа-яё_]+)\s*\}/gi;
const MARKUP = /(<!--[\s\S]*?-->|<\/?[a-z!][^>]*>)/i;

const bodyStart = (source: string) => source.indexOf("<body");

/**
 * Договор для фрейма: метки подсвечены жёлтым. {таблица_работ} стоит голым
 * текстом прямо в <tbody> — браузер вынес бы её из таблицы, поэтому здесь она
 * в служебной строке, а frameToBody возвращает её на место.
 */
export function bodyToFrame(body: string): string {
  const at = Math.max(bodyStart(body), 0);
  let tables = 0;
  let cells = 0;
  const tail = body.slice(at).replace(/<[^>]*>|\{\s*([a-zа-яё_]+)\s*\}/gi, (m, key?: string) => {
    if (!key) {
      if (/^<table\b/i.test(m)) tables++;
      else if (/^<\/table/i.test(m)) tables--;
      else if (/^<t[dh]\b/i.test(m)) cells++;
      else if (/^<\/t[dh]\b/i.test(m)) cells--;
      return m;
    }
    const mark = `<mark ${TAG_ATTR} style="background:#fde68a;color:#1f2937;border-radius:3px;padding:0 3px;">${m}</mark>`;
    return key.toLowerCase() === "таблица_работ" && tables > 0 && cells === 0
      ? `<tr ${ROW_ATTR}><td colspan="10">${mark}</td></tr>`
      : mark;
  });
  return body.slice(0, at) + tail;
}

/** Копия документа без подсветки и служебных строк — такой, каким он хранится. */
function cleanRoot(doc: Document): HTMLElement {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector("body")?.removeAttribute("contenteditable");
  // Chrome при наборе оставляет пустой style — разметкой это не считаем.
  root.querySelectorAll('[style=""]').forEach((el) => el.removeAttribute("style"));
  root.querySelectorAll(`tr[${ROW_ATTR}]`).forEach((tr) => tr.replaceWith(doc.createTextNode(tr.textContent ?? "")));
  root.querySelectorAll(`mark[${TAG_ATTR}]`).forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
  return root;
}

function textNodes(doc: Document, body: HTMLElement): Text[] {
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

/** Разметка документа без текста: совпала — значит, менялись только слова. */
export function structureOf(doc: Document): string {
  const root = cleanRoot(doc);
  const body = root.querySelector("body") as HTMLElement;
  textNodes(doc, body).forEach((t) => t.remove());
  return body.outerHTML;
}

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");

/** Текст договора из отредактированного фрейма. */
export function frameToBody(doc: Document, original: string, structure: string): string {
  const root = cleanRoot(doc);
  const body = root.querySelector("body") as HTMLElement;
  const hasBody = bodyStart(original) >= 0;
  const at = Math.max(bodyStart(original), 0);

  const decoder = doc.createElement("textarea");
  const decode = (html: string) => {
    decoder.innerHTML = html;
    return decoder.value;
  };
  const parts = original.slice(at).split(MARKUP);
  const slots = parts.flatMap((part, i) => (i % 2 === 0 && /\S/.test(decode(part)) ? [i] : []));
  const edited = textNodes(doc, body).filter((t) => /\S/.test(t.data));

  if (structureOf(doc) === structure && slots.length === edited.length) {
    slots.forEach((slot, n) => {
      if (decode(parts[slot]) !== edited[n].data) parts[slot] = escapeText(edited[n].data);
    });
    return original.slice(0, at) + parts.join("");
  }

  // Человек поменял разметку (новый абзац, жирный, вставка) — кусками текста
  // это не описать, пересобираем только <body>. Шапка и стили остаются как были.
  if (!hasBody) return body.innerHTML;
  const end = original.lastIndexOf("</body>");
  return original.slice(0, at) + body.outerHTML + (end >= 0 ? original.slice(end + "</body>".length) : "");
}

function countTags(html: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of html.matchAll(PLACEHOLDER)) {
    const key = m[1].toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Какие метки правка удалила, а какие разорвала тегами (видны, но не подставятся). */
export function damagedTags(before: string, after: string): { lost: string[]; broken: string[] } {
  const was = countTags(before);
  const now = countTags(after);
  const seen = countTags(after.replace(new RegExp(MARKUP.source, "gi"), ""));
  const lost: string[] = [];
  const broken: string[] = [];
  for (const [key, count] of was) {
    const left = now.get(key) ?? 0;
    if (left >= count) continue;
    ((seen.get(key) ?? 0) > left ? broken : lost).push(`{${key}}`);
  }
  return { lost, broken };
}
