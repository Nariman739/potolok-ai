import React from "react";
import { Image, Link, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { fmtDate, fmtPrice } from "./shared";

// Одностраничное «быстрое» КП.
// Когда клиент в WhatsApp спрашивает «а сколько примерно?» — мастер
// быстро присылает этот лист: примерная цена + дисклеймер + WhatsApp CTA.
// Дизайн использует ту же тему (palette + fonts), что и полное КП.

const A4_W = 595;
const A4_H = 842;

export function QuickPage({ data }: { data: PdfData }) {
  const { theme, fonts, master, estimate, qrDataUrl } = data;
  const isDarkCover = theme.palette.coverBg !== theme.palette.pageBg;

  // Округляем примерную цену до 10 000 ₸ — чтобы выглядело "от руки"
  const approxPrice = Math.round(estimate.total / 10000) * 10000;

  const waPhone = master.whatsappPhone.replace(/\D/g, "");
  const waUrl = `https://wa.me/${waPhone}`;

  // Тексты — берём из config.quick если мастер переопределил, иначе дефолты.
  // Дефолты можно тоже редактировать через AI-помощника в конструкторе.
  const q = data.config.quick ?? {};
  const heroTitle =
    q.heroTitle ??
    (estimate.clientName
      ? `${firstName(estimate.clientName)}, вот примерная стоимость по вашей квартире`
      : "Примерная стоимость по вашей квартире");
  const pricePreLabel = q.pricePreLabel ?? "Полная стоимость работ с материалами";
  const priceDisclaimer =
    q.priceDisclaimer ??
    "Это ориентир по средним параметрам похожих квартир. Финальная сумма — на замере: зависит от количества светильников, формы потолка и выбранной плёнки. Замер бесплатный.";
  const itemsTitle = q.itemsTitle ?? "Что вы получаете";
  const items =
    q.items && q.items.length === 3
      ? q.items
      : [
          {
            title: "Замер на дому",
            body: "Приедем в удобное время, замерим, обсудим варианты. Бесплатно, ни к чему не обязывает.",
          },
          {
            title: "Материалы",
            body: "Плёнка, профиль, светильники, крепёж — всё привозим с собой, докупать ничего не нужно.",
          },
          {
            title: "Монтаж от одного дня",
            body: `Чистый монтаж, уборка после работ. Гарантия ${master.warrantyMaterials} лет на плёнку, ${master.warrantyInstall} ${pluralRu(master.warrantyInstall, ["год", "года", "лет"])} на работы.`,
          },
        ];
  const ctaLabel = q.ctaLabel ?? "Написать в WhatsApp · ответим в течение 15 минут";

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: theme.palette.coverBg,
        color: theme.palette.coverText,
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Верхняя цветная полоса-якорь */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 6,
          backgroundColor: theme.palette.accent,
        }}
      />

      {/* Шапка: лого + название компании + tagline */}
      <View
        style={{
          position: "absolute",
          top: 36,
          left: 40,
          right: 40,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image
              src={master.logoUrl}
              style={{ width: 36, height: 36, marginRight: 12 }}
            />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                backgroundColor: theme.palette.accent,
                marginRight: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: theme.palette.accentText,
                  fontFamily: fonts.display.family,
                  fontWeight: fonts.display.weight as 400 | 700 | 800,
                  fontSize: 16,
                }}
              >
                {(master.companyName[0] || "P").toUpperCase()}
              </Text>
            </View>
          )}
          <View>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 14,
                color: isDarkCover ? "#FFFFFF" : theme.palette.pageText,
              }}
            >
              {master.companyName}
            </Text>
            {master.tagline && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 8,
                  color: isDarkCover ? "#FFFFFF99" : theme.palette.pageMuted,
                  marginTop: 2,
                  letterSpacing: 0.4,
                }}
              >
                {master.tagline}
              </Text>
            )}
          </View>
        </View>
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: isDarkCover ? "#FFFFFF99" : theme.palette.pageMuted,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Предварительный расчёт · {fmtDate(estimate.createdAt)}
        </Text>
      </View>

      {/* Главный блок: личное обращение по имени + локация под ним */}
      <View
        style={{
          position: "absolute",
          top: 130,
          left: 40,
          right: 40,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 24,
            color: isDarkCover ? "#FFFFFF" : theme.palette.pageText,
            lineHeight: 1.15,
            marginBottom: 10,
            letterSpacing: -0.5,
          }}
        >
          {heroTitle}
        </Text>
        {(estimate.clientAddress || estimate.totalArea > 0) && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 10,
              color: isDarkCover ? "#FFFFFFB3" : theme.palette.pageMuted,
              lineHeight: 1.4,
            }}
          >
            {[
              estimate.clientAddress,
              estimate.totalArea > 0
                ? `${estimate.totalArea.toFixed(1).replace(".", ",")} м²`
                : null,
              estimate.rooms.length > 0
                ? `${estimate.rooms.length} ${pluralRu(estimate.rooms.length, ["помещение", "помещения", "помещений"])}`
                : null,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        )}
      </View>

      {/* Цена — крупный блок в accent, как доминанта страницы */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 235,
          backgroundColor: theme.palette.accent,
          paddingTop: 40,
          paddingBottom: 36,
          paddingLeft: 40,
          paddingRight: 40,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: theme.palette.accentText + "CC",
            letterSpacing: 2.2,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {pricePreLabel}
        </Text>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 78,
            color: theme.palette.accentText,
            lineHeight: 0.95,
            letterSpacing: -2,
          }}
        >
          {fmtPrice(approxPrice)}
        </Text>
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 10,
            color: theme.palette.accentText + "E6",
            marginTop: 18,
            letterSpacing: 0.3,
            textAlign: "center",
            maxWidth: 440,
            lineHeight: 1.5,
          }}
        >
          {priceDisclaimer}
        </Text>
      </View>

      {/* Что вы получаете — три пункта в строку */}
      <View
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: 470,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: isDarkCover ? "#FFFFFFCC" : theme.palette.pageMuted,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {itemsTitle}
        </Text>
        <View style={{ flexDirection: "row" }}>
          {items.slice(0, 3).map((it, i) => (
            <IncludedItem
              key={i}
              n={String(i + 1).padStart(2, "0")}
              title={it.title}
              body={it.body}
              isDark={isDarkCover}
              data={data}
            />
          ))}
        </View>
      </View>

      {/* CTA: написать в WhatsApp */}
      <Link src={waUrl}>
        <View
          style={{
            position: "absolute",
            left: 40,
            right: 40,
            top: 620,
            backgroundColor: "#25D366",
            paddingTop: 18,
            paddingBottom: 18,
            paddingLeft: 24,
            paddingRight: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: "#FFFFFFB3",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {ctaLabel}
            </Text>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 22,
                color: "#FFFFFF",
              }}
            >
              {master.whatsappPhone}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 32,
              color: "#FFFFFF",
            }}
          >
            →
          </Text>
        </View>
      </Link>

      {/* Доп.контакты + QR — внизу */}
      <View
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          bottom: 50,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: isDarkCover ? "#FFFFFF99" : theme.palette.pageMuted,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Позвонить или написать
          </Text>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 14,
              color: isDarkCover ? "#FFFFFF" : theme.palette.pageText,
              marginBottom: 3,
            }}
          >
            {master.phone}
          </Text>
          {master.instagramUrl && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 10,
                color: isDarkCover ? "#FFFFFFB3" : theme.palette.pageMuted,
              }}
            >
              @
              {master.instagramUrl
                .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                .replace(/\/$/, "")}
            </Text>
          )}
        </View>
        {qrDataUrl && (
          <View style={{ alignItems: "center" }}>
            <Image
              src={qrDataUrl}
              style={{
                width: 70,
                height: 70,
                backgroundColor: "#FFFFFF",
                padding: 4,
                marginBottom: 6,
              }}
            />
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 7,
                color: isDarkCover ? "#FFFFFF99" : theme.palette.pageMuted,
                letterSpacing: 0.5,
                textAlign: "center",
              }}
            >
              Открыть онлайн
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <Text
        style={{
          position: "absolute",
          left: 40,
          bottom: 22,
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: isDarkCover ? "#FFFFFF66" : theme.palette.pageMuted,
          letterSpacing: 0.8,
        }}
      >
        Расчёт сделан в potolok.ai · Это ориентир, не публичная оферта
      </Text>
    </Page>
  );
}

function firstName(full: string): string {
  return (full || "").split(/\s+/)[0] || full;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function IncludedItem({
  n,
  title,
  body,
  isDark,
  data,
}: {
  n: string;
  title: string;
  body: string;
  isDark: boolean;
  data: PdfData;
}) {
  const { theme, fonts } = data;
  return (
    <View
      style={{
        flex: 1,
        paddingRight: 16,
        borderTopWidth: 1,
        borderTopColor: isDark ? "#FFFFFF40" : theme.palette.hairline,
        paddingTop: 12,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 22,
          color: theme.palette.accent,
          marginBottom: 6,
          letterSpacing: -0.5,
        }}
      >
        {n}
      </Text>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 13,
          color: isDark ? "#FFFFFF" : theme.palette.pageText,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 9,
          color: isDark ? "#FFFFFFB3" : theme.palette.pageMuted,
          lineHeight: 1.4,
        }}
      >
        {body}
      </Text>
    </View>
  );
}
