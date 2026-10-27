import React from "react";
import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { makeStyles, PageFooter } from "./shared";
import { SectionHeader } from "./SectionHeader";

/**
 * СТРАНИЦА — «Как это будет выглядеть» (26.10.2026). По одному фото на каждый
 * тип элемента из этого КП (трек, световая линия, теневой профиль, софиты…)
 * с подписью на человеческом языке. Нариман: «когда клиент видит цену и всё
 * объяснено фото, не будет спрашивать, как всё делается».
 *
 * Сетка 2 × 3 на странице; если типов больше шести — вторая страница.
 */

export const GALLERY_PER_PAGE = 6;

export function GalleryPage({
  data,
  pageNum,
  totalPages,
  sectionNumber = "02",
  items,
  part,
  parts,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
  sectionNumber?: string;
  items: PdfData["gallery"];
  part: number;
  parts: number;
}) {
  const { theme, fonts } = data;
  const styles = makeStyles(theme, fonts);
  const gap = 14;
  const contentW = 595 - 36 * 2;
  // Один-два типа — карточки на всю ширину, иначе страница выглядит пустой
  const single = items.length <= 2;
  const cardW = single ? contentW : (contentW - gap) / 2;
  // 118pt: три ряда по две карточки влезают в A4 с шапкой и сноской;
  // при 150 третий ряд уезжал на почти пустую вторую страницу
  const imgH = single ? 230 : 118;

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Что входит"
        title={parts > 1 ? `Как это будет выглядеть · ${part} из ${parts}` : "Как это будет выглядеть"}
        subtitle="Элементы вашего потолка на примерах реальных работ"
        sectionNumber={sectionNumber}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
        {items.map((g, i) => (
          <View
            key={g.kind}
            style={{
              width: cardW,
              marginRight: !single && i % 2 === 0 ? gap : 0,
              marginBottom: single ? 22 : 16,
            }}
            wrap={false}
          >
            <View style={{ width: cardW, height: imgH, backgroundColor: theme.palette.surface, overflow: "hidden" }}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={g.url} style={{ width: cardW, height: imgH, objectFit: "cover" }} />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                marginTop: 7,
                paddingBottom: 3,
                borderBottomWidth: theme.decor.hairlineWidth,
                borderBottomColor: theme.palette.hairline,
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.display.family,
                  fontWeight: fonts.display.weight as 400 | 700 | 800,
                  fontSize: 11.5,
                  color: theme.palette.pageText,
                  letterSpacing: -0.1,
                }}
              >
                {g.label}
              </Text>
              {g.own && (
                <Text style={{ fontFamily: fonts.body.family, fontSize: 6.5, color: theme.palette.accent, marginLeft: 6, letterSpacing: 1, textTransform: "uppercase" }}>
                  наш вариант
                </Text>
              )}
            </View>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8.5,
                color: theme.palette.pageMuted,
                lineHeight: 1.4,
                marginTop: 4,
              }}
            >
              {g.caption}
            </Text>
          </View>
        ))}
      </View>

      <Text style={{ position: "absolute", left: 36, bottom: 40, fontFamily: fonts.body.family, fontSize: 6.5, color: theme.palette.pageMuted }}>
        Фото для примера: ваш потолок будет сделан по вашему плану и выбранным материалам
      </Text>

      <PageFooter theme={theme} fonts={fonts} index={pageNum} total={totalPages} brand={data.master.companyName} />
    </Page>
  );
}
