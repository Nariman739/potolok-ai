import React from "react";
import { Image, Link, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData, PdfLineItem } from "../pdf-data";
import { fmtDate, PriceText, QtyPriceText, tengeSafeFamily } from "./shared";

// «Быстрое» КП.
// Когда клиент в WhatsApp спрашивает «а сколько примерно?» — мастер
// быстро присылает этот лист: цена + из чего она складывается (позиции
// с ценой за м²/м.п./шт.) + дисклеймер + WhatsApp CTA.
// Дизайн использует ту же тему (palette + fonts), что и полное КП.
// Вёрстка потоковая (не absolute): список позиций любой длины, при
// переполнении react-pdf сам переносит хвост на вторую страницу.

export function QuickPage({ data }: { data: PdfData }) {
  const { theme, fonts, master, estimate, qrDataUrl } = data;
  const isDarkCover = theme.palette.coverBg !== theme.palette.pageBg;
  const textMain = isDarkCover ? "#FFFFFF" : theme.palette.pageText;
  const textMuted = isDarkCover ? "#FFFFFFB3" : theme.palette.pageMuted;
  const hairline = isDarkCover ? "#FFFFFF" : theme.palette.hairline;

  const groups = [
    ...estimate.rooms
      .filter((r) => r.items.length > 0)
      .map((r) => ({ title: r.name, items: r.items, total: r.total })),
    ...(estimate.extraItems.length > 0
      ? [{ title: "Дополнительно", items: estimate.extraItems, total: 0 }]
      : []),
  ];
  const hasItems = groups.length > 0;
  const showGroupTitles = groups.length > 1;

  // Без позиций — округляем до 10 000 ₸, «ориентир от руки».
  // С позициями — точная сумма, иначе не сходится со списком.
  const price = hasItems ? estimate.total : Math.round(estimate.total / 10000) * 10000;

  const waPhone = master.whatsappPhone.replace(/\D/g, "");
  const waUrl = `https://wa.me/${waPhone}`;

  // Тексты — берём из config.quick если мастер переопределил, иначе дефолты.
  // Дефолты можно тоже редактировать через AI-помощника в конструкторе.
  const q = data.config.quick ?? {};
  const name = firstName(estimate.clientName);
  const heroTitle =
    q.heroTitle ??
    (name && name !== "Клиент"
      ? `${name}, вот примерная стоимость по вашей квартире`
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

  const eyebrow = {
    fontFamily: fonts.body.family,
    fontSize: 8,
    color: textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
    fontWeight: 600 as const,
  };

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: theme.palette.coverBg,
        color: theme.palette.coverText,
        fontFamily: fonts.body.family,
        paddingTop: 36,
        paddingBottom: 44,
        paddingLeft: 40,
        paddingRight: 40,
      }}
    >
      {/* Верхняя цветная полоса-якорь */}
      <View
        fixed
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
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image src={master.logoUrl} style={{ width: 36, height: 36, marginRight: 12 }} />
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
                color: textMain,
              }}
            >
              {master.companyName}
            </Text>
            {master.tagline && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 8,
                  color: textMuted,
                  marginTop: 2,
                  letterSpacing: 0.4,
                }}
              >
                {master.tagline}
              </Text>
            )}
          </View>
        </View>
        <Text style={{ ...eyebrow, fontWeight: 400, letterSpacing: 1.5 }}>
          Предварительный расчёт · {fmtDate(estimate.createdAt)}
        </Text>
      </View>

      {/* Личное обращение по имени + адрес/площадь под ним */}
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 22,
          color: textMain,
          lineHeight: 1.15,
          marginBottom: 8,
          letterSpacing: -0.5,
        }}
      >
        {heroTitle}
      </Text>
      {(estimate.clientAddress || estimate.totalArea > 0) && (
        <Text style={{ fontFamily: fonts.body.family, fontSize: 10, color: textMuted, lineHeight: 1.4 }}>
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

      {/* Цена — блок в accent, доминанта страницы */}
      <View
        wrap={false}
        style={{
          marginTop: 20,
          marginLeft: -40,
          marginRight: -40,
          backgroundColor: theme.palette.accent,
          paddingTop: hasItems ? 22 : 36,
          paddingBottom: hasItems ? 20 : 32,
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
            marginBottom: 10,
          }}
        >
          {pricePreLabel}
        </Text>
        <PriceText
          amount={price}
          size={hasItems ? 48 : 72}
          color={theme.palette.accentText}
          fonts={fonts}
          align="center"
        />
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: theme.palette.accentText + "E6",
            marginTop: 14,
            letterSpacing: 0.3,
            textAlign: "center",
            maxWidth: 440,
            lineHeight: 1.5,
          }}
        >
          {priceDisclaimer}
        </Text>
      </View>

      {/* Из чего складывается цена — позиции с ценой за единицу */}
      {hasItems && (
        <View style={{ marginTop: 22 }}>
          <Text style={{ ...eyebrow, marginBottom: 8 }}>Из чего складывается цена</Text>
          {groups.map((g, gi) => (
            <View key={gi} style={{ marginBottom: showGroupTitles ? 10 : 0 }}>
              {showGroupTitles && (
                <View
                  wrap={false}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingTop: 6,
                    paddingBottom: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: textMain,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.display.family,
                      fontWeight: fonts.display.weight as 400 | 700 | 800,
                      fontSize: 12,
                      color: textMain,
                    }}
                  >
                    {g.title}
                  </Text>
                  {g.total > 0 && (
                    <PriceText amount={g.total} size={11} tengeSize={10} color={theme.palette.accent} fonts={fonts} use="body" weight={600} />
                  )}
                </View>
              )}
              {g.items.map((it, i) => (
                <QuickItemRow key={i} item={it} data={data} textMain={textMain} textMuted={textMuted} hairline={hairline} isDark={isDarkCover} />
              ))}
            </View>
          ))}
          {estimate.discountAmount > 0 && (
            <Text style={{ fontFamily: fonts.body.family, fontSize: 9, color: textMuted, marginTop: 6, textAlign: "right" }}>
              {estimate.discountPercent > 0 ? `Скидка ${estimate.discountPercent}%: ` : "Скидка: "}
              −{Math.round(estimate.discountAmount).toLocaleString("ru-RU")}{" "}
              <Text style={{ fontFamily: tengeSafeFamily(fonts.body.family) }}>₸</Text>
              {" — уже учтена в сумме"}
            </Text>
          )}
        </View>
      )}

      {/* Что вы получаете — три пункта в строку */}
      <View wrap={false} style={{ marginTop: 22 }}>
        <Text style={{ ...eyebrow, marginBottom: 12 }}>{itemsTitle}</Text>
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
      <Link src={waUrl} style={{ marginTop: 22, textDecoration: "none" }}>
        <View
          wrap={false}
          style={{
            backgroundColor: "#25D366",
            paddingTop: 16,
            paddingBottom: 16,
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
                fontSize: 20,
                color: "#FFFFFF",
              }}
            >
              {master.whatsappPhone}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Inter",
              fontSize: 28,
              color: "#FFFFFF",
            }}
          >
            →
          </Text>
        </View>
      </Link>

      {/* Доп.контакты + QR */}
      <View
        wrap={false}
        style={{
          marginTop: 22,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ ...eyebrow, fontWeight: 400, letterSpacing: 1, marginBottom: 4 }}>
            Позвонить или написать
          </Text>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 14,
              color: textMain,
              marginBottom: 3,
            }}
          >
            {master.phone}
          </Text>
          {master.instagramUrl && (
            <Text style={{ fontFamily: fonts.body.family, fontSize: 10, color: textMuted }}>
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
              style={{ width: 70, height: 70, backgroundColor: "#FFFFFF", padding: 4, marginBottom: 6 }}
            />
            <Text style={{ fontFamily: fonts.body.family, fontSize: 7, color: textMuted, letterSpacing: 0.5 }}>
              Открыть онлайн
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <Text
        fixed
        style={{
          position: "absolute",
          left: 40,
          bottom: 20,
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

function QuickItemRow({
  item,
  data,
  textMain,
  textMuted,
  hairline,
  isDark,
}: {
  item: PdfLineItem;
  data: PdfData;
  textMain: string;
  textMuted: string;
  hairline: string;
  isDark: boolean;
}) {
  const { fonts } = data;
  return (
    <View wrap={false}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 5,
        paddingBottom: 5,
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontFamily: fonts.body.family, fontSize: 10, color: textMain, lineHeight: 1.3 }}>
          {item.name}
        </Text>
        <View style={{ marginTop: 1 }}>
          <QtyPriceText
            quantity={item.quantity}
            unit={item.unit}
            unitPrice={item.unitPrice}
            fonts={fonts}
            size={8.5}
            color={textMuted}
          />
        </View>
      </View>
      <View style={{ width: 90 }}>
        <PriceText amount={item.total} size={10} tengeSize={9} color={textMain} fonts={fonts} align="right" use="body" weight={600} />
      </View>
    </View>
    {/* Разделитель полоской, не border: border с прозрачным цветом на тёмной
        теме react-pdf рисует зелёным. */}
    <View style={{ height: 0.5, backgroundColor: hairline, opacity: isDark ? 0.2 : 1 }} />
    </View>
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
