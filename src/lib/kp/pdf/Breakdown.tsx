import React from "react";
import { Link, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { fmtArea, makeStyles, PageFooter, PriceText } from "./shared";
import { SectionHeader } from "./SectionHeader";
import { RoomPlan2D } from "./RoomPlan2D";

// СТРАНИЦА — Детальный разбор по комнатам.
// Шапка комнаты — драматичный large-number ("01") + вертикальная цветная полоса,
// без сплошной цветной плашки. Это делает страницу богаче и легче дышать.

export function BreakdownPage({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, estimate } = data;
  const styles = makeStyles(theme, fonts);

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Состав проекта"
        title="Что входит в работу"
        subtitle={`${estimate.rooms.length} помещени${pluralRu(estimate.rooms.length, ["е", "я", "й"])} · ${fmtArea(estimate.totalArea)} общей площади`}
        sectionNumber="01"
      />

      {estimate.rooms.map((room, idx) => (
        <RoomCard key={room.id} room={room} data={data} index={idx} />
      ))}

      {estimate.extraItems.length > 0 && (
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 6,
              paddingTop: 8,
              borderTopWidth: theme.decor.hairlineWidth,
              borderTopColor: theme.palette.hairline,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8,
                color: theme.palette.accent,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              + Дополнительные работы
            </Text>
          </View>
          {estimate.extraItems.map((item, i) => (
            <ItemRow key={i} data={data} item={item} />
          ))}
        </View>
      )}

      {/* Итого — асимметричный блок с крупной цифрой справа */}
      <View
        style={{
          marginTop: 6,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 22,
          paddingRight: 22,
          backgroundColor: theme.palette.accent,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
        wrap={false}
      >
        <View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: theme.palette.accentText + "BB",
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Итого к оплате
          </Text>
          {estimate.discountPercent > 0 && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: theme.palette.accentText + "DD",
              }}
            >
              Скидка {estimate.discountPercent}% уже учтена
            </Text>
          )}
        </View>
        <PriceText
          amount={estimate.total}
          size={28}
          color={theme.palette.accentText}
          tengeSize={18}
          tengeColor={theme.palette.accentText}
          fonts={fonts}
        />
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

function RoomCard({
  room,
  data,
  index,
}: {
  room: PdfData["estimate"]["rooms"][number];
  data: PdfData;
  index: number;
}) {
  const { theme, fonts } = data;
  const roomNum = String(index + 1).padStart(2, "0");

  return (
    <View
      style={{
        marginBottom: 6,
        flexDirection: "row",
      }}
      wrap={true}
    >
      {/* Слева — крупный номер комнаты, мини-план с замера (если есть),
          вертикальная цветная полоса. План показывает форму комнаты
          и расстановку софитов/люстры — клиент сразу видит «где что». */}
      <View
        style={{
          width: 56,
          alignItems: "center",
          paddingTop: 2,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 26,
            color: theme.palette.accent,
            letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {roomNum}
        </Text>
        {room.designerData && (
          <Link
            src={`${data.publicUrl}/3d#room-${room.id}`}
            style={{ textDecoration: "none" }}
          >
            <View style={{ marginTop: 10, alignItems: "center" }}>
              <RoomPlan2D
                designerData={room.designerData}
                size={48}
                fillColor={theme.palette.accentSoft}
                strokeColor={theme.palette.accent}
                spotColor={theme.palette.pageText}
                chandelierColor={theme.palette.accent}
              />
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 6,
                  color: theme.palette.accent,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginTop: 3,
                }}
              >
                3D →
              </Text>
            </View>
          </Link>
        )}
        <View
          style={{
            width: 2,
            flex: 1,
            backgroundColor: theme.palette.accent,
            marginTop: 10,
            minHeight: 20,
          }}
        />
      </View>

      <View style={{ flex: 1, paddingLeft: 12 }}>
        {/* Шапка — название комнаты, площадь, итог. Без заливки. */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingBottom: 8,
            borderBottomWidth: theme.decor.hairlineWidth * 2,
            borderBottomColor: theme.palette.pageText,
            marginBottom: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 15,
                color: theme.palette.pageText,
                marginRight: 10,
                letterSpacing: -0.2,
              }}
            >
              {room.name}
            </Text>
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: theme.palette.pageMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {fmtArea(room.area)}
            </Text>
          </View>
          <PriceText
            amount={room.total}
            size={14}
            color={theme.palette.accent}
            tengeSize={11}
            fonts={fonts}
          />
        </View>

        {/* Список позиций — без фона */}
        <View>
          {room.items.map((item, i) => (
            <ItemRow key={i} item={item} data={data} />
          ))}
        </View>
      </View>
    </View>
  );
}

function ItemRow({
  item,
  data,
}: {
  item: PdfData["estimate"]["rooms"][number]["items"][number];
  data: PdfData;
}) {
  const { theme, fonts } = data;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 5,
        paddingBottom: 5,
        borderBottomWidth: theme.decor.hairlineWidth,
        borderBottomColor: theme.palette.hairline,
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 10,
            color: theme.palette.pageText,
            lineHeight: 1.3,
          }}
        >
          {item.name}
        </Text>
      </View>
      <View style={{ width: 70, paddingRight: 8 }}>
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: theme.palette.pageMuted,
            textAlign: "right",
          }}
        >
          {formatQty(item.quantity)} {item.unit}
        </Text>
      </View>
      <View style={{ width: 80 }}>
        <PriceText
          amount={item.total}
          size={10}
          color={theme.palette.pageText}
          tengeSize={9}
          fonts={fonts}
          align="right"
          use="body"
          weight={600}
        />
      </View>
    </View>
  );
}

function formatQty(n: number): string {
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(1).replace(".", ",");
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
