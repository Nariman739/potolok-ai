"use client";

import { Printer } from "lucide-react";
import { tFor, type Lang } from "@/lib/i18n";
import "@/lib/i18n/contract";

/**
 * «Распечатать» на странице договора (26.09.2026). Клиент часто хочет бумагу
 * или PDF себе: на телефоне системная печать даёт «Сохранить в файлы».
 * Кнопка скрыта при печати через @media print в глобальных стилях страницы.
 */
export function PrintButton({ lang = "ru" }: { lang?: Lang }) {
  const t = tFor(lang);
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Printer className="h-3.5 w-3.5" />
      {t("page.ct.print")}
    </button>
  );
}
