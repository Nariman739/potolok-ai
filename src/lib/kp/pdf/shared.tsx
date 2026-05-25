// Общие константы, форматирование и микро-компоненты для PDF-страниц.
// Все размеры в pt (1pt = 1/72 inch). A4 = 595 × 842 pt.

import React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { KpTheme, FontPair } from "../types";

export const PAGE_PADDING = 36; // pt вокруг страницы
export const A4 = { width: 595, height: 842 };

export function fmtPrice(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(v)) + " ₸";
}

// fmtPriceNum — только число, без ₸. Используется когда нужно отрисовать
// сумму крупным сериф-шрифтом (Playfair / Cormorant), а ₸ — отдельным шрифтом
// который точно содержит этот глиф (Inter / Lora).
export function fmtPriceNum(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("ru-RU").format(Math.round(v));
}

// Универсальный price-компонент с двумя шрифтами: число — display (или body), ₸ — tenge font.
// Темы где display не имеет ₸ глифа: premium-dark (Playfair), bold-color (Manrope).
// Темы где body не имеет ₸: warm-handmade (Manrope), bold-color (Manrope).
// Безопасный fallback для ₸: Inter (всегда содержит ₸ и зарегистрирован).
export function PriceText({
  amount,
  size,
  color,
  fonts,
  tengeSize,
  tengeColor,
  align = "left",
  use = "display",
  weight,
}: {
  amount: number | null | undefined;
  size: number;
  color: string;
  fonts: FontPair;
  tengeSize?: number;
  tengeColor?: string;
  align?: "left" | "right" | "center";
  use?: "display" | "body";
  weight?: 400 | 600 | 700 | 800;
}) {
  const baseFont = use === "body" ? fonts.body : fonts.display;
  const tFamily = TENGE_SAFE_FAMILY[baseFont.family] || "Inter";
  const tWeight = TENGE_SAFE_WEIGHT[baseFont.family] || 400;
  const tSize = tengeSize ?? Math.round(size * 0.55);
  const tCol = tengeColor ?? color;
  const justify = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  const fw = weight ?? (baseFont.weight as 400 | 600 | 700 | 800);

  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: justify }}>
      <Text
        style={{
          fontFamily: baseFont.family,
          fontWeight: fw,
          fontSize: size,
          color,
          lineHeight: 1,
        }}
      >
        {fmtPriceNum(amount)}
      </Text>
      <Text
        style={{
          fontFamily: tFamily,
          fontWeight: tWeight as 400 | 700 | 800,
          fontSize: tSize,
          color: tCol,
          marginLeft: Math.max(4, Math.round(size * 0.1)),
        }}
      >
        ₸
      </Text>
    </View>
  );
}

// Какой шрифт использовать для ₸ в зависимости от шрифта числа.
// Для шрифтов с ₸ глифом — используем сам шрифт (визуально консистентно).
// Для остальных — Inter (всегда работает, имеет ₸).
// Проверено через fonttools (см. CLAUDE.md):
//   HAS ₸: Inter, Lora, Cormorant Garamond
//   НЕТ ₸: Manrope, Playfair Display
const TENGE_SAFE_FAMILY: Record<string, string> = {
  "Inter": "Inter",
  "Playfair Display": "Inter",                // у Playfair нет ₸ → Inter (схож по характеру)
  "Lora": "Lora",                             // у Lora есть ₸
  "Manrope": "Inter",                         // у Manrope нет ₸ → Inter (близкий sans)
  "Cormorant Garamond": "Cormorant Garamond", // у Cormorant есть ₸
};
const TENGE_SAFE_WEIGHT: Record<string, number> = {
  "Inter": 600,
  "Playfair Display": 600,
  "Lora": 700,
  "Manrope": 600,
  "Cormorant Garamond": 700,
};

export function fmtArea(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toFixed(1).replace(".", ",") + " м²";
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function makeStyles(theme: KpTheme, fonts: FontPair) {
  return StyleSheet.create({
    page: {
      backgroundColor: theme.palette.pageBg,
      color: theme.palette.pageText,
      fontFamily: fonts.body.family,
      fontSize: 10,
      padding: PAGE_PADDING,
    },
    coverPage: {
      backgroundColor: theme.palette.coverBg,
      color: theme.palette.coverText,
      fontFamily: fonts.body.family,
      fontSize: 10,
      padding: PAGE_PADDING,
    },
    h1: {
      fontFamily: fonts.display.family,
      fontWeight: fonts.display.weight as 400 | 700 | 800,
      fontSize: 28,
      color: theme.palette.pageText,
      marginBottom: 4,
    },
    h2: {
      fontFamily: fonts.display.family,
      fontWeight: fonts.display.weight as 400 | 700 | 800,
      fontSize: 18,
      color: theme.palette.pageText,
      marginBottom: 6,
    },
    subheader: {
      fontFamily: fonts.body.family,
      fontSize: 9,
      letterSpacing: 1.2,
      color: theme.palette.pageMuted,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    body: {
      fontFamily: fonts.body.family,
      fontSize: 10,
      color: theme.palette.pageText,
      lineHeight: 1.5,
    },
    muted: {
      fontFamily: fonts.body.family,
      fontSize: 9,
      color: theme.palette.pageMuted,
    },
    hairline: {
      height: theme.decor.hairlineWidth,
      backgroundColor: theme.palette.hairline,
    },
  });
}

// ============================================
// Микро-компоненты
// ============================================

export function PageFooter({
  theme,
  fonts,
  index,
  total,
  brand,
}: {
  theme: KpTheme;
  fonts: FontPair;
  index: number;
  total: number;
  brand?: string;
}) {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 18,
        left: PAGE_PADDING,
        right: PAGE_PADDING,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
      fixed
    >
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.pageMuted,
          letterSpacing: 0.5,
        }}
      >
        {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </Text>
      {brand && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: theme.palette.pageMuted,
            letterSpacing: 0.5,
          }}
        >
          {brand}
        </Text>
      )}
    </View>
  );
}

export function SectionTitle({
  theme,
  fonts,
  eyebrow,
  title,
  subtitle,
}: {
  theme: KpTheme;
  fonts: FontPair;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View
      style={{
        marginBottom: 22,
        paddingLeft: 14,
        borderLeftWidth: 4,
        borderLeftColor: theme.palette.accent,
      }}
    >
      {eyebrow && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: theme.palette.accent,
            textTransform: "uppercase",
            letterSpacing: 1.6,
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </Text>
      )}
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 26,
          color: theme.palette.pageText,
          marginBottom: 6,
          lineHeight: 1.1,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 11,
            color: theme.palette.pageMuted,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}
