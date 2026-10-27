/**
 * Имя PDF-файла по-русски (27.10.2026, Диас: «я записываю на русском, а здесь
 * на латинице, когда скидываешь»). В Content-Disposition рядом с ASCII-именем
 * (для старых клиентов) отдаём filename* в UTF-8 — браузер и мобилка берут его.
 */

/** Убираем только то, что запрещено в именах файлов; кириллицу и пробелы оставляем. */
export function safeFileName(s: string, max = 80): string {
  const clean = s.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trim() : clean;
}

/** «27.10.2026» по Алматы — дата в имени файла. */
export function fileDate(d = new Date()): string {
  return d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** «КП — Асель — ул. Абая 120 — 27.10.2026» из непустых частей. */
export function prettyPdfName(parts: Array<string | null | undefined>): string {
  return safeFileName(parts.map((p) => (p ?? "").trim()).filter(Boolean).join(" — "));
}

export function pdfDisposition(type: "inline" | "attachment", pretty: string, asciiFallback: string): string {
  const ascii = asciiFallback.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "");
  return `${type}; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(`${pretty}.pdf`)}`;
}
