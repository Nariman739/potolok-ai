import React from "react";
import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { makeStyles, PageFooter } from "./shared";
import { SectionHeader } from "./SectionHeader";

// СТРАНИЦА — Портфолио.
// Асимметричный layout: 1 крупное фото слева (~60% ширины), 4 мелких справа сеткой 2×2.
// Для 1-3 фото — соответствующий fallback.

export function PortfolioPage({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, portfolio } = data;
  const styles = makeStyles(theme, fonts);

  const pageInnerW = 595 - 36 * 2; // 523pt
  const pics = portfolio.slice(0, 5);
  const hasHero = pics.length >= 1;
  const hero = pics[0];
  const rest = pics.slice(1);

  // Геометрия асимметричной сетки
  const gap = 8;
  const heroW = Math.round(pageInnerW * 0.6 - gap / 2);
  const heroH = 360;
  const smallW = pageInnerW - heroW - gap;
  const smallH = (heroH - gap) / 2;

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Портфолио"
        title="Наши работы"
        subtitle="Реальные потолки, реальные клиенты — без стоковых фото"
        sectionNumber="02"
      />

      {hasHero && (
        <View style={{ flexDirection: "row", marginBottom: 16 }}>
          {/* HERO слева */}
          <View style={{ width: heroW, marginRight: gap }}>
            <PortfolioCard
              item={hero}
              width={heroW}
              height={heroH}
              theme={theme}
              fonts={fonts}
              large
            />
          </View>
          {/* RIGHT — 2×2 grid (4 фото) или меньше */}
          <View style={{ width: smallW, flexDirection: "column" }}>
            {[0, 1].map((row) => (
              <View
                key={row}
                style={{
                  flexDirection: "row",
                  marginBottom: row === 0 ? gap : 0,
                }}
              >
                {[0, 1].map((col) => {
                  const idx = row * 2 + col;
                  const item = rest[idx];
                  if (!item) {
                    return (
                      <View
                        key={col}
                        style={{
                          width: (smallW - gap) / 2,
                          height: smallH,
                          marginRight: col === 0 ? gap : 0,
                          backgroundColor: theme.palette.surface,
                        }}
                      />
                    );
                  }
                  return (
                    <View
                      key={col}
                      style={{
                        width: (smallW - gap) / 2,
                        marginRight: col === 0 ? gap : 0,
                      }}
                    >
                      <PortfolioCard
                        item={item}
                        width={(smallW - gap) / 2}
                        height={smallH}
                        theme={theme}
                        fonts={fonts}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Подпись внизу — счётчик работ + слоган */}
      <View
        style={{
          marginTop: 8,
          paddingTop: 14,
          borderTopWidth: theme.decor.hairlineWidth,
          borderTopColor: theme.palette.hairline,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: theme.palette.pageMuted,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Всего работ в портфолио
          </Text>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 26,
              color: theme.palette.accent,
              letterSpacing: -0.5,
            }}
          >
            {portfolio.length}+
          </Text>
        </View>
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 10,
            color: theme.palette.pageMuted,
            maxWidth: 280,
            textAlign: "right",
            lineHeight: 1.5,
          }}
        >
          Каждая работа — это{"\n"}наше «спасибо» клиенту за доверие
        </Text>
      </View>

      <PageFooter
        theme={theme}
        fonts={fonts}
        index={pageNum}
        total={totalPages}
        brand={data.master.companyName}
      />
    </Page>
  );
}

function PortfolioCard({
  item,
  width,
  height,
  theme,
  fonts,
  large,
}: {
  item: PdfData["portfolio"][number];
  width: number;
  height: number;
  theme: PdfData["theme"];
  fonts: PdfData["fonts"];
  large?: boolean;
}) {
  return (
    <View style={{ width, position: "relative" }}>
      <View
        style={{
          width,
          height,
          backgroundColor: theme.palette.surface,
          overflow: "hidden",
        }}
      >
        {item.photoUrl ? (
          <Image
            src={item.photoUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
      </View>
      {/* Caption поверх фото внизу — полупрозрачная плашка */}
      {(item.title || item.ceilingType) && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#00000099",
            paddingTop: large ? 12 : 8,
            paddingBottom: large ? 12 : 8,
            paddingLeft: large ? 16 : 10,
            paddingRight: large ? 16 : 10,
          }}
        >
          {item.ceilingType && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: large ? 8 : 7,
                color: theme.palette.accent,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 800,
                marginBottom: 3,
              }}
            >
              {item.ceilingType}
            </Text>
          )}
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: large ? 14 : 9,
              color: "#FFFFFF",
              lineHeight: 1.2,
              letterSpacing: -0.2,
            }}
          >
            {item.title || item.ceilingType || "Потолок"}
          </Text>
        </View>
      )}
    </View>
  );
}
