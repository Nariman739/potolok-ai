import React from "react";
import { Text, View } from "@react-pdf/renderer";
import type { KpTheme, FontPair } from "../types";

// Темо-зависимая шапка секции для внутренних страниц.
// 5 тем → 5 разных стилей хедера.

export function SectionHeader({
  theme,
  fonts,
  eyebrow,
  title,
  subtitle,
  sectionNumber,
}: {
  theme: KpTheme;
  fonts: FontPair;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  sectionNumber?: string; // "01", "02" — фоновая большая цифра
}) {
  switch (theme.id) {
    case "premium-dark":
      return (
        <SectionHeaderPremium
          theme={theme}
          fonts={fonts}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          sectionNumber={sectionNumber}
        />
      );
    case "warm-handmade":
      return (
        <SectionHeaderWarm
          theme={theme}
          fonts={fonts}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          sectionNumber={sectionNumber}
        />
      );
    case "classic-architectural":
      return (
        <SectionHeaderClassic
          theme={theme}
          fonts={fonts}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          sectionNumber={sectionNumber}
        />
      );
    case "bold-color":
      return (
        <SectionHeaderBold
          theme={theme}
          fonts={fonts}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          sectionNumber={sectionNumber}
        />
      );
    case "minimal":
    default:
      return (
        <SectionHeaderMinimal
          theme={theme}
          fonts={fonts}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          sectionNumber={sectionNumber}
        />
      );
  }
}

type Props = {
  theme: KpTheme;
  fonts: FontPair;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  sectionNumber?: string;
};

// MINIMAL — Apple-стиль: маленький eyebrow, крупный заголовок без декора, тонкая линия снизу
function SectionHeaderMinimal({ theme, fonts, eyebrow, title, subtitle, sectionNumber }: Props) {
  return (
    <View style={{ marginBottom: 18, position: "relative" }}>
      {sectionNumber && (
        <Text
          style={{
            position: "absolute",
            right: 0,
            top: -8,
            fontFamily: fonts.display.family,
            fontWeight: 400,
            fontSize: 96,
            color: theme.palette.accent,
            opacity: 0.08,
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          {sectionNumber}
        </Text>
      )}
      {eyebrow && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: theme.palette.accent,
            textTransform: "uppercase",
            letterSpacing: 2.5,
            marginBottom: 14,
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
          fontSize: 32,
          color: theme.palette.pageText,
          marginBottom: subtitle ? 8 : 14,
          lineHeight: 1.05,
          letterSpacing: -1,
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
            marginBottom: 16,
          }}
        >
          {subtitle}
        </Text>
      )}
      <View
        style={{
          height: 0.5,
          backgroundColor: theme.palette.hairline,
          marginTop: 4,
        }}
      />
    </View>
  );
}

// PREMIUM-DARK (для светлых внутр.страниц) — серифом, центрировано, двойная золотая линия
function SectionHeaderPremium({ theme, fonts, eyebrow, title, subtitle, sectionNumber }: Props) {
  return (
    <View style={{ marginBottom: 18, alignItems: "center", position: "relative" }}>
      {sectionNumber && (
        <Text
          style={{
            position: "absolute",
            right: 0,
            top: -20,
            fontFamily: fonts.display.family,
            fontWeight: 400,
            fontSize: 110,
            color: theme.palette.accent,
            opacity: 0.1,
            letterSpacing: -3,
            lineHeight: 1,
          }}
        >
          {sectionNumber}
        </Text>
      )}
      {eyebrow && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 7.5,
            color: theme.palette.accent,
            textTransform: "uppercase",
            letterSpacing: 4,
            marginBottom: 14,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          — {eyebrow} —
        </Text>
      )}
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 30,
          color: theme.palette.pageText,
          marginBottom: subtitle ? 10 : 14,
          lineHeight: 1.0,
          letterSpacing: -0.3,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 10,
            color: theme.palette.pageMuted,
            lineHeight: 1.4,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {subtitle}
        </Text>
      )}
      {/* Двойная золотая линия */}
      <View
        style={{
          width: 40,
          height: 0.5,
          backgroundColor: theme.palette.accent,
          marginBottom: 2,
        }}
      />
      <View
        style={{
          width: 40,
          height: 0.5,
          backgroundColor: theme.palette.accent,
        }}
      />
    </View>
  );
}

// WARM-HANDMADE — справа большая полупрозрачная цифра, основной текст слева, тёплое
function SectionHeaderWarm({ theme, fonts, eyebrow, title, subtitle, sectionNumber }: Props) {
  return (
    <View
      style={{
        marginBottom: 28,
        position: "relative",
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.palette.hairline,
      }}
    >
      {sectionNumber && (
        <Text
          style={{
            position: "absolute",
            right: -10,
            top: -20,
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 120,
            color: theme.palette.accent,
            opacity: 0.1,
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          {sectionNumber}
        </Text>
      )}
      {eyebrow && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8.5,
            color: theme.palette.accent,
            textTransform: "uppercase",
            letterSpacing: 2.5,
            marginBottom: 10,
            fontWeight: 800,
          }}
        >
          {eyebrow}
        </Text>
      )}
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 34,
          color: theme.palette.pageText,
          marginBottom: subtitle ? 8 : 0,
          lineHeight: 1.05,
          letterSpacing: -0.8,
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
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

// CLASSIC-ARCHITECTURAL — толстые горизонтальные правила, симметрия, центр
function SectionHeaderClassic({ theme, fonts, eyebrow, title, subtitle, sectionNumber }: Props) {
  return (
    <View style={{ marginBottom: 18 }}>
      {/* Толстое верхнее правило */}
      <View
        style={{
          height: 3,
          backgroundColor: "#000000",
          marginBottom: 14,
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        {sectionNumber && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: "#000000",
              letterSpacing: 2.5,
              fontWeight: 600,
            }}
          >
            {sectionNumber} —
          </Text>
        )}
        {eyebrow && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: theme.palette.accent,
              textTransform: "uppercase",
              letterSpacing: 3,
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 38,
          color: "#000000",
          marginBottom: subtitle ? 8 : 14,
          lineHeight: 1.02,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 10,
            color: "#525252",
            lineHeight: 1.5,
            marginBottom: 14,
            letterSpacing: 0.2,
          }}
        >
          {subtitle}
        </Text>
      )}
      <View
        style={{
          height: 1,
          backgroundColor: "#000000",
        }}
      />
    </View>
  );
}

// BOLD-COLOR — гигантский заголовок, стрелка-указатель, минимум декора
function SectionHeaderBold({ theme, fonts, eyebrow, title, subtitle, sectionNumber }: Props) {
  return (
    <View style={{ marginBottom: 18, position: "relative" }}>
      {sectionNumber && (
        <Text
          style={{
            position: "absolute",
            right: 0,
            top: -6,
            fontFamily: fonts.display.family,
            fontWeight: 800,
            fontSize: 130,
            color: theme.palette.accent,
            opacity: 0.1,
            letterSpacing: -5,
            lineHeight: 1,
          }}
        >
          {sectionNumber}
        </Text>
      )}
      {eyebrow && (
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8.5,
            color: theme.palette.accent,
            textTransform: "uppercase",
            letterSpacing: 2.5,
            marginBottom: 14,
            fontWeight: 800,
          }}
        >
          → {eyebrow}
        </Text>
      )}
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: 800,
          fontSize: 44,
          color: theme.palette.pageText,
          marginBottom: subtitle ? 10 : 18,
          lineHeight: 0.98,
          letterSpacing: -1.8,
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
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          {subtitle}
        </Text>
      )}
      {/* Толстая accent линия */}
      <View
        style={{
          height: 4,
          width: 60,
          backgroundColor: theme.palette.accent,
        }}
      />
    </View>
  );
}
