/**
 * Договор внутри страницы клиента (09.11.2026).
 *
 * Договор хранится целым HTML-документом со своим <style>. Вставленный в
 * страницу, этот стиль красил всю страницу (отступ body), а сам документ
 * получал сброс Tailwind: заголовки не жирные, текст у края карточки. Здесь
 * его стили привязываются к контейнеру. Сохранённые снимки не меняются —
 * преобразование только при показе.
 */

export const CONTRACT_DOC_CLASS = "contract-doc";
const SCOPE = `.${CONTRACT_DOC_CLASS}`;

// Без специфичности и вне слоёв: снимает сброс Tailwind, стили шаблона сильнее.
const RESET = `:where(${SCOPE}, ${SCOPE} *){all:revert}`;

function scopeSelector(selector: string): string {
  const sel = selector.trim();
  const root = /^(?:html\s+body|html|body|:root)(?![\w-])/i.exec(sel);
  if (!root) return `${SCOPE} ${sel}`;
  // Сам документ: body → контейнер, body.dark → контейнер.dark, body p → потомки.
  const rest = sel.slice(root[0].length);
  return `${SCOPE}${/^[.:#[]/.test(rest) ? rest : rest.trimStart() ? ` ${rest.trimStart()}` : ""}`;
}

function scopeCss(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open);
    const semi = prelude.lastIndexOf(";");
    const head = prelude.slice(semi + 1).trim();
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    if (depth > 0) break;
    const inner = css.slice(open + 1, j - 1);
    if (/^@(media|supports|container)\b/i.test(head)) {
      out += `${head}{${scopeCss(inner)}}`;
    } else if (head.startsWith("@")) {
      out += `${head}{${inner}}`;
    } else {
      out += `${head.split(/,(?![^(]*\))/).map(scopeSelector).join(",")}{${inner}}`;
    }
    i = j;
  }
  return out;
}

/** Стили и содержимое договора для вставки в страницу. */
export function contractView(html: string): { css: string; body: string } {
  const styles: string[] = [];
  const noStyles = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css: string) => {
    styles.push(css);
    return "";
  });
  const open = /<body\b[^>]*>/i.exec(noStyles);
  let body: string;
  if (open) {
    const start = open.index + open[0].length;
    const close = noStyles.slice(start).search(/<\/body\s*>/i);
    body = close >= 0 ? noStyles.slice(start, start + close) : noStyles.slice(start);
  } else {
    body = noStyles.replace(/<head\b[\s\S]*?<\/head\s*>/i, "").replace(/<!doctype[^>]*>|<\/?html\b[^>]*>/gi, "");
  }
  // <meta refresh> в тексте увёл бы клиента со страницы договора.
  for (let prev = ""; prev !== body; ) {
    prev = body;
    body = body.replace(/<meta\b[^>]*>/gi, "");
  }
  return { css: RESET + scopeCss(styles.join("\n").replace(/\/\*[\s\S]*?\*\//g, "")), body };
}
