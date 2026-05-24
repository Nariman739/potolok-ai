import React from "react";
import { Image, Link, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { makeStyles, PageFooter } from "./shared";
import { SectionHeader } from "./SectionHeader";

// СТРАНИЦА — Финал. CTA, контакты, QR, реквизиты, футер.
// WhatsApp перестал быть «зелёной плашкой» — теперь композиционный CTA
// в accent-цвете темы. Стоковый зелёный был чужеродным.

export function ContactsPage({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, qrDataUrl, publicUrl } = data;
  const styles = makeStyles(theme, fonts);

  const waPhone = master.whatsappPhone.replace(/\D/g, "");
  const waUrl = `https://wa.me/${waPhone}`;

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Следующий шаг"
        title="Готовы начать?"
        subtitle="Один шаг — и мы согласуем дату монтажа. Звонок займёт 3 минуты."
        sectionNumber="04"
      />

      {/* CTA-блок WhatsApp — теперь в accent-цвете темы, не зелёный
          Композиционный: слева eyebrow + телефон, справа QR-код приглашающий открыть онлайн */}
      <Link src={waUrl} style={{ textDecoration: "none" }}>
        <View
          style={{
            backgroundColor: theme.palette.accent,
            paddingTop: 28,
            paddingBottom: 28,
            paddingLeft: 28,
            paddingRight: 28,
            marginBottom: 18,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8,
                color: theme.palette.accentText + "CC",
                letterSpacing: 2.5,
                textTransform: "uppercase",
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              Написать в WhatsApp
            </Text>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 30,
                color: theme.palette.accentText,
                letterSpacing: -0.8,
                lineHeight: 1,
              }}
            >
              {master.whatsappPhone}
            </Text>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: theme.palette.accentText + "BB",
                marginTop: 10,
                letterSpacing: 0.3,
              }}
            >
              Ответим в течение 15 минут в рабочее время
            </Text>
          </View>
          {/* Большой круглый индикатор стрелки */}
          <View
            style={{
              width: 64,
              height: 64,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.palette.accentText + "22",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 28,
                color: theme.palette.accentText,
              }}
            >
              →
            </Text>
          </View>
        </View>
      </Link>

      {/* Доп.контакты — две тонких карточки без backgroundColor, разделены вертикальной линией */}
      <View
        style={{
          flexDirection: "row",
          marginBottom: 22,
          borderTopWidth: theme.decor.hairlineWidth,
          borderBottomWidth: theme.decor.hairlineWidth,
          borderTopColor: theme.palette.hairline,
          borderBottomColor: theme.palette.hairline,
          paddingTop: 16,
          paddingBottom: 16,
        }}
      >
        <View
          style={{
            flex: 1,
            paddingLeft: 4,
            paddingRight: 12,
            borderRightWidth: master.instagramUrl ? theme.decor.hairlineWidth : 0,
            borderRightColor: theme.palette.hairline,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: theme.palette.accent,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Позвонить
          </Text>
          <Link src={`tel:${master.phone}`} style={{ textDecoration: "none" }}>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 16,
                color: theme.palette.pageText,
                letterSpacing: -0.3,
              }}
            >
              {master.phone}
            </Text>
          </Link>
        </View>
        {master.instagramUrl && (
          <View
            style={{
              flex: 1,
              paddingLeft: 16,
              paddingRight: 4,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 7,
                color: theme.palette.accent,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Instagram
            </Text>
            <Link src={master.instagramUrl} style={{ textDecoration: "none" }}>
              <Text
                style={{
                  fontFamily: fonts.display.family,
                  fontWeight: fonts.display.weight as 400 | 700 | 800,
                  fontSize: 16,
                  color: theme.palette.pageText,
                  letterSpacing: -0.3,
                }}
              >
                @{master.instagramUrl
                  .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                  .replace(/\/$/, "")}
              </Text>
            </Link>
          </View>
        )}
      </View>

      {/* QR-блок — асимметричный, на surface, QR крупно */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: 22,
          paddingBottom: 22,
          paddingLeft: 22,
          paddingRight: 22,
          backgroundColor: theme.palette.surface,
          marginBottom: 26,
        }}
      >
        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: 6,
            marginRight: 22,
          }}
        >
          <Image
            src={qrDataUrl}
            style={{
              width: 96,
              height: 96,
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: theme.palette.accent,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Онлайн-версия КП
          </Text>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 18,
              color: theme.palette.pageText,
              marginBottom: 8,
              lineHeight: 1.2,
              letterSpacing: -0.4,
            }}
          >
            Откройте в 3D и подтвердите проект онлайн
          </Text>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: theme.palette.pageMuted,
              lineHeight: 1.4,
            }}
          >
            {publicUrl}
          </Text>
        </View>
      </View>

      {/* Реквизиты */}
      {(master.legalName || master.bin || master.iban) && (
        <View
          style={{
            paddingTop: 14,
            borderTopWidth: theme.decor.hairlineWidth,
            borderTopColor: theme.palette.hairline,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: theme.palette.pageMuted,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 8,
              fontWeight: 600,
            }}
          >
            Реквизиты исполнителя
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {master.legalName && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontWeight: 600,
                  fontSize: 9,
                  color: theme.palette.pageText,
                  marginRight: 18,
                  marginBottom: 2,
                }}
              >
                {master.legalName}
              </Text>
            )}
            {master.bin && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 9,
                  color: theme.palette.pageMuted,
                  marginRight: 18,
                  marginBottom: 2,
                }}
              >
                БИН: {master.bin}
              </Text>
            )}
            {master.iban && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 9,
                  color: theme.palette.pageMuted,
                  marginBottom: 2,
                }}
              >
                {master.iban}
              </Text>
            )}
          </View>
        </View>
      )}

      <PageFooter
        theme={theme}
        fonts={fonts}
        index={pageNum}
        total={totalPages}
        brand="potolok.ai"
      />
    </Page>
  );
}
