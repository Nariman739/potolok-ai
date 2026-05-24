import React from "react";
import { Document } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import type { KpSection } from "../types";
import { ensureFontsRegistered } from "./fonts";
import { CoverPage } from "./Cover";
import { BreakdownPage } from "./Breakdown";
import { PortfolioPage } from "./Portfolio";
import { TrustPage } from "./Trust";
import { ContactsPage } from "./Contacts";
import { QuickPage } from "./QuickPage";

// Главный документ КП. Читает kpConfig.sections и собирает страницы в указанном порядке.
// Логические группировки:
//   - cover       → 1 страница Cover (всегда первая)
//   - breakdown   → 1+ страниц Breakdown (page-break автоматический)
//   - portfolio   → 1 страница Portfolio (если enabled и есть фото)
//   - warranties/reviews/faq/about → ОБЪЕДИНЯЮТСЯ в 1 страницу Trust
//                                    (или несколько, если контента много)
//   - contacts    → 1 страница Contacts (всегда последняя)

type PageBlock =
  | { kind: "cover" }
  | { kind: "breakdown" }
  | { kind: "portfolio" }
  | { kind: "trust"; blocks: KpSection[] }
  | { kind: "contacts" };

function planPages(data: PdfData): PageBlock[] {
  const sections = data.config.sections;
  const pages: PageBlock[] = [];
  let trustBuf: KpSection[] = [];

  const flushTrust = () => {
    if (trustBuf.length > 0) {
      pages.push({ kind: "trust", blocks: trustBuf });
      trustBuf = [];
    }
  };

  for (const s of sections) {
    if (s.type === "cover") {
      flushTrust();
      pages.push({ kind: "cover" });
    } else if (s.type === "breakdown") {
      flushTrust();
      pages.push({ kind: "breakdown" });
    } else if (s.type === "portfolio") {
      if (s.enabled && data.portfolio.length > 0) {
        flushTrust();
        pages.push({ kind: "portfolio" });
      }
    } else if (s.type === "contacts") {
      flushTrust();
      pages.push({ kind: "contacts" });
    } else {
      // warranties / reviews / faq / about → копим в trustBuf
      const isEnabled = "enabled" in s ? s.enabled : true;
      if (!isEnabled) continue;
      // reviews без данных — пропускаем
      if (s.type === "reviews" && data.reviews.length === 0) continue;
      // about без body — пропускаем
      if (s.type === "about" && !s.body?.trim()) continue;
      trustBuf.push(s);
    }
  }
  flushTrust();

  // Гарантируем минимум: cover, breakdown, contacts
  if (!pages.some((p) => p.kind === "cover")) pages.unshift({ kind: "cover" });
  if (!pages.some((p) => p.kind === "breakdown")) {
    const idx = pages.findIndex((p) => p.kind === "cover");
    pages.splice(idx + 1, 0, { kind: "breakdown" });
  }
  if (!pages.some((p) => p.kind === "contacts"))
    pages.push({ kind: "contacts" });

  return pages;
}

export function KpDocument({ data }: { data: PdfData }) {
  ensureFontsRegistered();

  // Quick format — единственная страница с примерной ценой и WhatsApp CTA.
  // Темы (palette + fonts) применяются точно так же.
  if (data.config.format === "quick") {
    return (
      <Document
        title={`Предварительный расчёт — ${data.estimate.clientName}`}
        author={data.master.companyName}
        producer="potolok.ai"
        creator="potolok.ai"
      >
        <QuickPage data={data} />
      </Document>
    );
  }

  const pages = planPages(data);
  const total = pages.length;

  return (
    <Document
      title={`КП — ${data.estimate.clientName}`}
      author={data.master.companyName}
      producer="potolok.ai"
      creator="potolok.ai"
    >
      {pages.map((p, i) => {
        const num = i + 1;
        switch (p.kind) {
          case "cover":
            return <CoverPage key={i} data={data} pageNum={num} totalPages={total} />;
          case "breakdown":
            return (
              <BreakdownPage key={i} data={data} pageNum={num} totalPages={total} />
            );
          case "portfolio":
            return (
              <PortfolioPage key={i} data={data} pageNum={num} totalPages={total} />
            );
          case "trust":
            return (
              <TrustPage
                key={i}
                data={data}
                pageNum={num}
                totalPages={total}
                blocks={p.blocks}
              />
            );
          case "contacts":
            return (
              <ContactsPage key={i} data={data} pageNum={num} totalPages={total} />
            );
        }
      })}
    </Document>
  );
}
