import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { fmtArea, makeStyles, PageFooter, PriceText, QtyPriceText, tengeSafeFamily } from "./shared";
import { currencySymbol } from "@/lib/currency";
import { SectionHeader } from "./SectionHeader";
import { RoomPlan2D } from "./RoomPlan2D";
import { anyGridded, KpRoomPlanCard, SCHEMATIC_NOTE } from "./PlanStyles";
import { roomDimsText } from "../plan-tidy";

// Ширина левой колонки комнаты: номер + план по замеру (26.10.2026 план стал
// крупнее — 48pt иконки клиент не читал, теперь видно софиты и гардины).
const ROOM_COL_W = 100;
const ROOM_PLAN_SIDE = 92;

// СТРАНИЦА — Детальный разбор по комнатам.
// Шапка комнаты — драматичный large-number ("01") + вертикальная цветная полоса,
// без сплошной цветной плашки. Это делает страницу богаче и легче дышать.

export function BreakdownPage({
  data,
  pageNum,
  totalPages,
  sectionNumber = "01",
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
  sectionNumber?: string;
}) {
  const { theme, fonts, estimate } = data;
  const styles = makeStyles(theme, fonts);
  const summary = estimate.priceView === "summary";
  const extrasTotal = estimate.extraItems.reduce((s, it) => s + (it.total || 0), 0);

  return (
    <Page size="A4" style={styles.page}>
      <SectionHeader
        theme={theme}
        fonts={fonts}
        eyebrow="Состав проекта"
        title="Что входит в работу"
        subtitle={`${estimate.rooms.length} помещени${pluralRu(estimate.rooms.length, ["е", "я", "й"])} · ${fmtArea(estimate.totalArea)} общей площади`}
        sectionNumber={sectionNumber}
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
              justifyContent: "space-between",
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
            {/* В кратком виде у позиций нет сумм — итог блока показываем в шапке. */}
            {summary && extrasTotal > 0 && (
              <PriceText
                amount={extrasTotal}
                currency={data.master.currency}
                size={11}
                color={theme.palette.accent}
                tengeSize={9}
                fonts={fonts}
                use="body"
                weight={600}
              />
            )}
          </View>
          {estimate.extraItems.map((item, i) => (
            <ItemRow key={i} data={data} item={item} />
          ))}
        </View>
      )}

      {anyGridded(estimate.rooms) && (
        <Text style={{ fontFamily: fonts.body.family, fontSize: 7.5, color: theme.palette.pageMuted, marginTop: 4, marginBottom: 6 }}>
          * {SCHEMATIC_NOTE}
        </Text>
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
          {estimate.discountAmount > 0 && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: theme.palette.accentText + "DD",
              }}
            >
              {/* Знак валюты — шрифтом, где этот глиф есть: у Manrope/Playfair его нет,
                  печаталось «−5 000 ¸уже учтена». */}
              {estimate.discountPercent > 0 ? `Скидка ${estimate.discountPercent}% (` : "Скидка "}
              −{Math.round(estimate.discountAmount).toLocaleString("ru-RU")}{" "}
              <Text style={{ fontFamily: tengeSafeFamily(fonts.body.family) }}>{currencySymbol(data.master.currency)}</Text>
              {estimate.discountPercent > 0 ? ") уже учтена" : " уже учтена"}
            </Text>
          )}
        </View>
        <PriceText
          amount={estimate.total}
          currency={data.master.currency}
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
  // Комната переезжает на новую страницу целиком: при разрыве номер оставался
  // внизу, а листик плана уезжал на следующую. Только очень длинный список
  // (больше 12 позиций) разрешаем рвать.
  return (
    <View
      style={{
        marginBottom: 6,
        flexDirection: "row",
      }}
      wrap={room.items.length > 12}
    >
      {/* Слева — крупный номер комнаты, план с замера (если есть),
          вертикальная цветная полоса. План показывает форму комнаты
          и расстановку софитов/люстры — клиент сразу видит «где что». */}
      <View
        style={{
          width: ROOM_COL_W,
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
        {room.plan ? (
          <View style={{ marginTop: 9, alignItems: "center" }}>
            {/* Листик из тетради: в «Подробно» — длины стен в метрах от руки,
                в «Кратко» размеров нет (16.10.2026) */}
            <KpRoomPlanCard data={data} room={room.plan} side={ROOM_PLAN_SIDE} />
          </View>
        ) : room.designerData ? (
          <View style={{ marginTop: 10, alignItems: "center" }}>
            <RoomPlan2D
              designerData={room.designerData}
              size={48}
              fillColor={theme.palette.accentSoft}
              strokeColor={theme.palette.accent}
              spotColor={theme.palette.pageText}
              chandelierColor={theme.palette.accent}
            />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingLeft: 12 }}>
        {/* Шапка — название комнаты, площадь, итог. Без заливки.
            minPresenceAhead: шапка не остаётся одна внизу страницы — вместе с
            ней на страницу должны влезть хотя бы две первые строки. */}
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
          minPresenceAhead={50}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", flex: 1, paddingRight: 8 }}>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 15,
                color: theme.palette.pageText,
                marginRight: 10,
                letterSpacing: -0.2,
                maxLines: 1,
                textOverflow: "ellipsis",
              }}
            >
              {room.name}
            </Text>
            {data.estimate.priceView !== "summary" && (
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
                {/* Размеры стен текстом — в плитке плана они не читались (ревью 26.10.2026) */}
                {room.plan ? `  ·  ${roomDimsText(room.plan)}` : ""}
              </Text>
            )}
          </View>
          <PriceText
            amount={room.total}
            currency={data.master.currency}
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
  // Кратко: только название маркером — без количества, цены и суммы позиции.
  // Итог комнаты в её шапке уже есть, общий итог — внизу страницы.
  if (data.estimate.priceView === "summary") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          paddingTop: 4,
          paddingBottom: 4,
          borderBottomWidth: theme.decor.hairlineWidth,
          borderBottomColor: theme.palette.hairline,
        }}
        wrap={false}
      >
        <Text style={{ fontFamily: fonts.body.family, fontSize: 10, color: theme.palette.accent, width: 12 }}>•</Text>
        <Text style={{ fontFamily: fonts.body.family, fontSize: 10, color: theme.palette.pageText, lineHeight: 1.3, flex: 1 }}>
          {item.name}
        </Text>
      </View>
    );
  }
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
      wrap={false}
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
      <View style={{ width: 120, paddingRight: 8 }}>
        {item.itemCode !== "min_order" && (
          <QtyPriceText
            quantity={item.quantity}
            unit={item.unit}
            unitPrice={item.unitPrice}
            currency={data.master.currency}
            fonts={fonts}
            size={9}
            color={theme.palette.pageMuted}
            align="right"
          />
        )}
      </View>
      <View style={{ width: 80 }}>
        <PriceText
          amount={item.total}
          currency={data.master.currency}
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

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
