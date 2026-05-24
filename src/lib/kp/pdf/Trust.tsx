import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { makeStyles, PageFooter } from "./shared";
import { SectionHeader } from "./SectionHeader";
import type { KpSection, WarrantyItem, FaqItem } from "../types";

// СТРАНИЦА — Доверие. Гарантии (infographic), отзывы, FAQ, about.
// Гарантии — большие цифры с подписями, как у Apple/Linear на marketing-странице.

export function TrustPage({
  data,
  pageNum,
  totalPages,
  blocks,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
  blocks: KpSection[];
}) {
  const { theme, fonts } = data;
  const styles = makeStyles(theme, fonts);

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Почему нам можно доверять"
        title="Гарантии и подход"
        sectionNumber="03"
      />

      {blocks.map((b, i) => {
        if (b.type === "warranties" && b.enabled) {
          return <WarrantiesBlock key={i} data={data} items={b.items} />;
        }
        if (b.type === "reviews" && b.enabled) {
          return <ReviewsBlock key={i} data={data} />;
        }
        if (b.type === "faq" && b.enabled) {
          return <FaqBlock key={i} data={data} items={b.items} />;
        }
        if (b.type === "about" && b.enabled) {
          return (
            <AboutBlock key={i} data={data} title={b.title} body={b.body} />
          );
        }
        return null;
      })}

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

// ============================================
// БЛОКИ
// ============================================

function WarrantiesBlock({
  data,
  items,
}: {
  data: PdfData;
  items: WarrantyItem[];
}) {
  const { theme, fonts } = data;
  return (
    <View style={{ marginBottom: 22 }} wrap={false}>
      {/* Header блока — мини-eyebrow */}
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.accent,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Наши гарантии
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginLeft: -8,
          marginRight: -8,
        }}
      >
        {items.map((it, i) => (
          <View
            key={i}
            style={{
              width: items.length >= 4 ? "25%" : `${100 / Math.max(items.length, 1)}%`,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <View
              style={{
                paddingTop: 18,
                paddingBottom: 18,
                paddingLeft: 4,
                paddingRight: 4,
                borderTopWidth: 2,
                borderTopColor: theme.palette.accent,
                minHeight: 110,
              }}
            >
              {/* Большая цифра / значение */}
              <Text
                style={{
                  fontFamily: fonts.display.family,
                  fontWeight: fonts.display.weight as 400 | 700 | 800,
                  fontSize: extractIsShort(it.value) ? 40 : 22,
                  color: theme.palette.accent,
                  marginBottom: 10,
                  letterSpacing: -1.5,
                  lineHeight: 1,
                }}
              >
                {it.value}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 9,
                  color: theme.palette.pageText,
                  letterSpacing: 0.3,
                  lineHeight: 1.4,
                  fontWeight: 600,
                }}
              >
                {it.title}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Помогает выбрать размер шрифта: "10 лет" — это короткое значение для крупной цифры,
// "Электронная подпись" — длинное, не должно быть 40pt.
function extractIsShort(value: string): boolean {
  return value.length <= 8;
}

function ReviewsBlock({ data }: { data: PdfData }) {
  const { theme, fonts, reviews } = data;
  if (reviews.length === 0) return null;

  return (
    <View style={{ marginBottom: 22 }} wrap={false}>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.accent,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Что говорят клиенты
      </Text>
      <View
        style={{
          flexDirection: "row",
          marginLeft: -8,
          marginRight: -8,
        }}
      >
        {reviews.slice(0, 2).map((r) => (
          <View
            key={r.id}
            style={{
              flex: 1,
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            <View
              style={{
                paddingTop: 16,
                paddingBottom: 16,
                paddingLeft: 18,
                paddingRight: 18,
                borderLeftWidth: 2,
                borderLeftColor: theme.palette.accent,
                backgroundColor: theme.palette.surface,
              }}
            >
              {/* Большая кавычка декоративная */}
              <Text
                style={{
                  fontFamily: fonts.display.family,
                  fontWeight: fonts.display.weight as 400 | 700 | 800,
                  fontSize: 40,
                  color: theme.palette.accent,
                  lineHeight: 0.5,
                  marginBottom: 4,
                  letterSpacing: -2,
                }}
              >
                {"“"}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 10,
                  color: theme.palette.pageText,
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                {r.text}
              </Text>
              <View
                style={{
                  paddingTop: 8,
                  borderTopWidth: 0.5,
                  borderTopColor: theme.palette.hairline,
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.body.family,
                    fontSize: 11,
                    color: theme.palette.accent,
                    letterSpacing: 1.5,
                    marginBottom: 4,
                  }}
                >
                  {"★".repeat(r.rating)}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.body.family,
                    fontWeight: 600,
                    fontSize: 9,
                    color: theme.palette.pageText,
                  }}
                >
                  {r.clientName}
                  {r.location ? `, ${r.location}` : ""}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function FaqBlock({ data, items }: { data: PdfData; items: FaqItem[] }) {
  const { theme, fonts } = data;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.accent,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        Частые вопросы
      </Text>
      {items.map((q, i) => (
        <View
          key={i}
          style={{
            paddingTop: 10,
            paddingBottom: 10,
            borderTopWidth: i === 0 ? 0 : theme.decor.hairlineWidth,
            borderTopColor: theme.palette.hairline,
            flexDirection: "row",
          }}
          wrap={false}
        >
          {/* Номер вопроса слева */}
          <View style={{ width: 24 }}>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 11,
                color: theme.palette.accent,
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontWeight: 600,
                fontSize: 10,
                color: theme.palette.pageText,
                marginBottom: 4,
              }}
            >
              {q.q}
            </Text>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: theme.palette.pageMuted,
                lineHeight: 1.5,
              }}
            >
              {q.a}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function AboutBlock({
  data,
  title,
  body,
}: {
  data: PdfData;
  title: string;
  body: string;
}) {
  const { theme, fonts } = data;
  if (!body) return null;
  return (
    <View style={{ marginBottom: 22 }} wrap={false}>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.accent,
          letterSpacing: 2.5,
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 10,
          color: theme.palette.pageText,
          lineHeight: 1.6,
        }}
      >
        {body}
      </Text>
    </View>
  );
}
