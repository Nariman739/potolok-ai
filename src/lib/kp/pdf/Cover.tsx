import React from "react";
import { Image, Page, Text, View } from "@react-pdf/renderer";
import type { PdfData } from "../pdf-data";
import { fmtDate, fmtPrice, PAGE_PADDING, PriceText, fmtPriceNum } from "./shared";

// СТРАНИЦА 1 — Обложка.
// 5 ТЕМ — 5 РАЗНЫХ ЛЕЙАУТОВ. Никакого «один шаблон с разными цветами».
//   minimal               → Apple-минимализм: воздух, тонкая разделительная линия, цена справа в углу
//   premium-dark          → Sotheby's-стиль: тёмный фон, тонкие золотые правила, серьёзный воздух
//   warm-handmade         → ремесленный кремовый: hand-drawn пунктир, асимметрия, тепло
//   classic-architectural → архитектурный журнал: толстые горизонтальные правила, симметрия
//   bold-color            → Tesla keynote: гигантская типографика на цветном поле, минимум деталей

const A4_W = 595;
const A4_H = 842;

export function CoverPage({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme } = data;

  switch (theme.id) {
    case "premium-dark":
      return <CoverPremiumDark data={data} pageNum={pageNum} totalPages={totalPages} />;
    case "warm-handmade":
      return <CoverWarmHandmade data={data} pageNum={pageNum} totalPages={totalPages} />;
    case "classic-architectural":
      return <CoverClassicArchitectural data={data} pageNum={pageNum} totalPages={totalPages} />;
    case "bold-color":
      return <CoverBoldColor data={data} pageNum={pageNum} totalPages={totalPages} />;
    case "minimal":
    default:
      return <CoverMinimal data={data} pageNum={pageNum} totalPages={totalPages} />;
  }
}

// ============================================
// Хелпер: подсчёт точек света для hero-stats
// ============================================
function countSpots(estimate: PdfData["estimate"]): number {
  return estimate.rooms.reduce((s, r) => {
    const spotsItem = r.items.find((i) =>
      /софит|спот|светильник|led/i.test(i.name)
    );
    return s + (spotsItem ? Math.round(spotsItem.quantity) : 0);
  }, 0);
}

// fmtPriceParts — для удобства локального использования в Cover-секциях
function fmtPriceParts(n: number): { num: string; cur: string } {
  return { num: fmtPriceNum(n), cur: "₸" };
}

// ============================================
// MINIMAL — Apple-минимализм
// Белый фон, минимум элементов, цена в правом углу, тонкая линия.
// ============================================
function CoverMinimal({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, estimate } = data;
  const spotsCount = countSpots(estimate);
  const heroImageUrl = master.coverPhotoUrl || estimate.room3dPreviewUrl || "";
  const price = fmtPriceParts(estimate.total);

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: "#FAFAF9", // off-white, не чисто белый
        color: theme.palette.coverText,
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Тонкая accent-полоска сверху — 2pt, по правилу 10% акцента */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 2,
          backgroundColor: theme.palette.accent,
        }}
      />

      {/* Хедер: лого слева, № КП справа */}
      <View
        style={{
          position: "absolute",
          top: 40,
          left: 48,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image
              src={master.logoUrl}
              style={{ width: 28, height: 28, marginRight: 12 }}
            />
          ) : null}
          <View>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 11,
                color: theme.palette.pageText,
                letterSpacing: -0.2,
              }}
            >
              {master.companyName}
            </Text>
            {master.tagline && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 7,
                  color: theme.palette.pageMuted,
                  marginTop: 2,
                  letterSpacing: 0.4,
                }}
              >
                {master.tagline}
              </Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: theme.palette.pageMuted,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            № {estimate.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: theme.palette.pageText,
              letterSpacing: 0.3,
            }}
          >
            {fmtDate(estimate.createdAt)}
          </Text>
        </View>
      </View>

      {/* Hero photo — узкая полоса справа, 38% ширины, не доходит до низа */}
      {heroImageUrl && (
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 110,
            width: A4_W * 0.38,
            height: 360,
          }}
        >
          <Image
            src={heroImageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </View>
      )}

      {/* Eyebrow + клиент — асимметрия слева, ОЧЕНЬ много воздуха */}
      <View
        style={{
          position: "absolute",
          left: 48,
          top: 200,
          width: A4_W * 0.46,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: theme.palette.accent,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 32,
          }}
        >
          Дизайн-проект потолка
        </Text>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: 400,
            fontSize: 44,
            color: theme.palette.pageText,
            lineHeight: 1.02,
            letterSpacing: -1.5,
          }}
        >
          {estimate.clientName.split(" ")[0]}
        </Text>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: 400,
            fontSize: 44,
            color: theme.palette.accent,
            lineHeight: 1.02,
            letterSpacing: -1.5,
            marginBottom: 22,
          }}
        >
          {estimate.clientName.split(" ").slice(1).join(" ") || ""}
        </Text>
        {estimate.clientAddress && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 10,
              color: theme.palette.pageMuted,
              lineHeight: 1.5,
              maxWidth: 240,
            }}
          >
            {estimate.clientAddress}
          </Text>
        )}
      </View>

      {/* Тонкая горизонтальная линия-разделитель */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 560,
          height: 0.5,
          backgroundColor: theme.palette.hairline,
        }}
      />

      {/* Hero-stats — крупные цифры, между ними побольше воздуха, без правил сверху */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 588,
          flexDirection: "row",
        }}
      >
        <StatMinimal label="помещений" value={String(estimate.rooms.length)} theme={theme} fonts={fonts} />
        <StatMinimal label="м² площади" value={estimate.totalArea.toFixed(1).replace(".", ",")} theme={theme} fonts={fonts} />
        {spotsCount > 0 && (
          <StatMinimal label="точек света" value={String(spotsCount)} theme={theme} fonts={fonts} />
        )}
        <StatMinimal label="дней работы" value="5–7" theme={theme} fonts={fonts} />
      </View>

      {/* Цена в правом нижнем углу — асимметрия, цифра доминирующая */}
      <View
        style={{
          position: "absolute",
          left: 48,
          bottom: 80,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <View style={{ maxWidth: 200 }}>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: theme.palette.pageMuted,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Под ключ
          </Text>
          {estimate.validUntil && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8,
                color: theme.palette.pageMuted,
                lineHeight: 1.4,
              }}
            >
              Цена действительна{"\n"}до {fmtDate(estimate.validUntil)}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 56,
              color: theme.palette.pageText,
              lineHeight: 0.95,
              letterSpacing: -2,
            }}
          >
            {price.num}
          </Text>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: 400,
              fontSize: 28,
              color: theme.palette.accent,
              marginLeft: 6,
              marginBottom: 6,
            }}
          >
            {price.cur}
          </Text>
        </View>
      </View>

      {/* QR в углу, очень аккуратно */}
      {data.qrDataUrl && (
        <View
          style={{
            position: "absolute",
            right: 48,
            bottom: 28,
            alignItems: "flex-end",
          }}
        >
          <Image
            src={data.qrDataUrl}
            style={{ width: 38, height: 38 }}
          />
        </View>
      )}

      <Text
        style={{
          position: "absolute",
          left: 48,
          bottom: 28,
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: theme.palette.pageMuted,
          letterSpacing: 1,
        }}
      >
        {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function StatMinimal({
  label,
  value,
  theme,
  fonts,
}: {
  label: string;
  value: string;
  theme: PdfData["theme"];
  fonts: PdfData["fonts"];
}) {
  return (
    <View style={{ flex: 1, paddingRight: 8 }}>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: 400,
          fontSize: 26,
          color: theme.palette.pageText,
          marginBottom: 6,
          letterSpacing: -0.8,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: theme.palette.pageMuted,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================
// PREMIUM-DARK — Sotheby's / Tom Ford
// Тёмный фон, тонкие золотые правила, серьёзный воздух, серифная типографика
// ============================================
function CoverPremiumDark({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, estimate } = data;
  const spotsCount = countSpots(estimate);
  const heroImageUrl = master.coverPhotoUrl || estimate.room3dPreviewUrl || "";
  const price = fmtPriceParts(estimate.total);
  const GOLD = theme.palette.accent; // #D4AF37
  const DARK = "#0A1020"; // чуть глубже чем coverBg — нюанс
  const DARK2 = "#0F172A";

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: DARK,
        color: "#F8FAFC",
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Слегка светлее градиент-нюанс снизу — добавляет глубину */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: A4_H * 0.5,
          bottom: 0,
          backgroundColor: DARK2,
          opacity: 0.5,
        }}
      />

      {/* Тонкая золотая рамка по периметру — 0.5pt */}
      <View
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          top: 24,
          height: 0.5,
          backgroundColor: GOLD,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          bottom: 24,
          height: 0.5,
          backgroundColor: GOLD,
        }}
      />

      {/* Hero photo — занимает ~38% высоты вверху, между рамкой */}
      {heroImageUrl && (
        <>
          <View
            style={{
              position: "absolute",
              left: 48,
              right: 48,
              top: 100,
              height: 220,
            }}
          >
            <Image
              src={heroImageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </View>
          {/* Тонкая золотая хейрлайн под фото */}
          <View
            style={{
              position: "absolute",
              left: 48,
              right: 48,
              top: 326,
              height: 0.5,
              backgroundColor: GOLD,
            }}
          />
        </>
      )}

      {/* Шапка */}
      <View
        style={{
          position: "absolute",
          top: 44,
          left: 48,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image src={master.logoUrl} style={{ width: 32, height: 32, marginRight: 12 }} />
          ) : null}
          <View>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 13,
                color: "#F8FAFC",
                letterSpacing: 0.8,
              }}
            >
              {master.companyName.toUpperCase()}
            </Text>
            {master.tagline && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 7,
                  color: GOLD,
                  marginTop: 3,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                }}
              >
                {master.tagline}
              </Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: GOLD,
              letterSpacing: 3,
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            № {estimate.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: "#FFFFFFB0",
              letterSpacing: 0.5,
            }}
          >
            {fmtDate(estimate.createdAt)}
          </Text>
        </View>
      </View>

      {/* Eyebrow по центру */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 360,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: GOLD,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Individual ceiling design
        </Text>
      </View>

      {/* Имя клиента — серифом по центру, классично */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 390,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 48,
            color: "#F8FAFC",
            lineHeight: 1.05,
            letterSpacing: -0.5,
            textAlign: "center",
          }}
        >
          {estimate.clientName}
        </Text>
        {estimate.clientAddress && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: "#FFFFFF99",
              lineHeight: 1.5,
              marginTop: 14,
              letterSpacing: 1,
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            {estimate.clientAddress}
          </Text>
        )}
      </View>

      {/* Hero-stats — тонкие, через | разделитель */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 540,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatPremium label="Помещений" value={String(estimate.rooms.length)} theme={theme} fonts={fonts} />
        <DotGold />
        <StatPremium label="м²" value={estimate.totalArea.toFixed(1).replace(".", ",")} theme={theme} fonts={fonts} />
        {spotsCount > 0 && (
          <>
            <DotGold />
            <StatPremium label="Точек света" value={String(spotsCount)} theme={theme} fonts={fonts} />
          </>
        )}
        <DotGold />
        <StatPremium label="Дней" value="5–7" theme={theme} fonts={fonts} />
      </View>

      {/* Тонкая золотая линия */}
      <View
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 640,
          height: 0.5,
          backgroundColor: GOLD,
        }}
      />

      {/* Цена — крупно по центру, золотым. ₸ отдельным шрифтом Inter (Playfair его не имеет) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 660,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 7,
            color: "#FFFFFF80",
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Стоимость работ под ключ
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center" }}
        >
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 50,
              color: GOLD,
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            {price.num}
          </Text>
          <Text
            style={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 28,
              color: GOLD,
              marginLeft: 8,
            }}
          >
            ₸
          </Text>
        </View>
        {estimate.validUntil && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: "#FFFFFF80",
              letterSpacing: 0.5,
              marginTop: 14,
            }}
          >
            Цена действительна до {fmtDate(estimate.validUntil)}
          </Text>
        )}
      </View>

      {/* QR и страница */}
      {data.qrDataUrl && (
        <Image
          src={data.qrDataUrl}
          style={{
            position: "absolute",
            right: 48,
            bottom: 50,
            width: 44,
            height: 44,
            backgroundColor: "#FFFFFF",
          }}
        />
      )}

      <Text
        style={{
          position: "absolute",
          left: 48,
          bottom: 50,
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: GOLD,
          letterSpacing: 2,
        }}
      >
        {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function StatPremium({
  label,
  value,
  theme,
  fonts,
}: {
  label: string;
  value: string;
  theme: PdfData["theme"];
  fonts: PdfData["fonts"];
}) {
  return (
    <View style={{ alignItems: "center", marginLeft: 14, marginRight: 14 }}>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 22,
          color: "#F8FAFC",
          marginBottom: 4,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 6.5,
          color: theme.palette.accent,
          letterSpacing: 1.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function DotGold() {
  return (
    <View
      style={{
        width: 3,
        height: 3,
        backgroundColor: "#D4AF37",
      }}
    />
  );
}

// ============================================
// WARM-HANDMADE — ремесленный кремовый, тёплый, асимметричный
// ============================================
function CoverWarmHandmade({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, estimate } = data;
  const spotsCount = countSpots(estimate);
  const heroImageUrl = master.coverPhotoUrl || estimate.room3dPreviewUrl || "";
  const price = fmtPriceParts(estimate.total);
  const CREAM_DEEP = "#F7EAD3"; // нюанс глубже, чем coverBg
  const TERRA = theme.palette.accent;

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: theme.palette.coverBg, // #FFF8F0
        color: theme.palette.coverText,
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Глубокий кремовый прямоугольник снизу-справа — асимметрия */}
      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: A4_W * 0.55,
          height: A4_H * 0.45,
          backgroundColor: CREAM_DEEP,
        }}
      />

      {/* Hero photo — в "окошке" слева внизу, с тёплой рамкой */}
      {heroImageUrl && (
        <View
          style={{
            position: "absolute",
            left: 36,
            bottom: 200,
            width: 260,
            height: 200,
            backgroundColor: "#FFFFFF",
            padding: 6,
          }}
        >
          <Image
            src={heroImageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </View>
      )}

      {/* Большая полупрозрачная цифра на фоне — N помещений */}
      <Text
        style={{
          position: "absolute",
          right: -40,
          top: 60,
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 360,
          color: TERRA,
          opacity: 0.06,
          lineHeight: 0.9,
        }}
      >
        {String(estimate.rooms.length)}
      </Text>

      {/* Шапка */}
      <View
        style={{
          position: "absolute",
          top: 40,
          left: 48,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image src={master.logoUrl} style={{ width: 32, height: 32, marginRight: 12 }} />
          ) : null}
          <View>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: fonts.display.weight as 400 | 700 | 800,
                fontSize: 14,
                color: theme.palette.coverText,
              }}
            >
              {master.companyName}
            </Text>
            {master.tagline && (
              <Text
                style={{
                  fontFamily: fonts.body.family,
                  fontSize: 8,
                  color: theme.palette.coverMuted,
                  marginTop: 2,
                }}
              >
                {master.tagline}
              </Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {/* Декоративный «штамп» с номером — круглая плашка */}
          <View
            style={{
              backgroundColor: TERRA,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 12,
              paddingRight: 12,
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8,
                color: "#FFFFFF",
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 800,
              }}
            >
              № {estimate.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 8,
              color: theme.palette.coverMuted,
            }}
          >
            {fmtDate(estimate.createdAt)}
          </Text>
        </View>
      </View>

      {/* Подпись «с любовью» / eyebrow */}
      <View
        style={{
          position: "absolute",
          left: 48,
          top: 140,
          width: A4_W * 0.5,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: TERRA,
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: 800,
            marginBottom: 12,
          }}
        >
          С теплом и заботой для
        </Text>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 56,
            color: theme.palette.coverText,
            lineHeight: 1.0,
            letterSpacing: -1,
          }}
        >
          {estimate.clientName}
        </Text>
        {estimate.clientAddress && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 11,
              color: theme.palette.coverMuted,
              lineHeight: 1.5,
              marginTop: 14,
              maxWidth: 260,
            }}
          >
            {estimate.clientAddress}
          </Text>
        )}
      </View>

      {/* Hero-stats — вертикальный список справа на глубоком кремовом, ремесленный стиль */}
      <View
        style={{
          position: "absolute",
          right: 48,
          top: 360,
          width: 160,
        }}
      >
        <StatWarm label="помещения" value={String(estimate.rooms.length)} theme={theme} fonts={fonts} />
        <StatWarm label="м² общей" value={estimate.totalArea.toFixed(1).replace(".", ",")} theme={theme} fonts={fonts} />
        {spotsCount > 0 && (
          <StatWarm label="точек света" value={String(spotsCount)} theme={theme} fonts={fonts} />
        )}
        <StatWarm label="дней работы" value="5–7" theme={theme} fonts={fonts} />
      </View>

      {/* Цена — справа внизу, на глубоком кремовом блоке */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 80,
          alignItems: "flex-end",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: TERRA,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          Стоимость работ под ключ
        </Text>
        <View style={{ flexDirection: "row" }}>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 54,
              color: theme.palette.coverText,
              lineHeight: 0.95,
              letterSpacing: -1.5,
            }}
          >
            {price.num}
          </Text>
          <Text
            style={{
              fontFamily: "Lora",
              fontWeight: 700,
              fontSize: 30,
              color: TERRA,
              marginLeft: 10,
              marginTop: 12,
            }}
          >
            ₸
          </Text>
        </View>
        {estimate.validUntil && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: theme.palette.coverMuted,
              marginTop: 10,
            }}
          >
            до {fmtDate(estimate.validUntil)}
          </Text>
        )}
      </View>

      {/* QR */}
      {data.qrDataUrl && (
        <View
          style={{
            position: "absolute",
            left: 48,
            bottom: 50,
          }}
        >
          <Image src={data.qrDataUrl} style={{ width: 50, height: 50 }} />
        </View>
      )}

      <Text
        style={{
          position: "absolute",
          right: 48,
          bottom: 28,
          fontFamily: fonts.body.family,
          fontSize: 8,
          color: theme.palette.coverMuted,
          letterSpacing: 1,
        }}
      >
        {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function StatWarm({
  label,
  value,
  theme,
  fonts,
}: {
  label: string;
  value: string;
  theme: PdfData["theme"];
  fonts: PdfData["fonts"];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        marginBottom: 18,
        justifyContent: "flex-end",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 9,
          color: theme.palette.coverMuted,
          marginRight: 10,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 28,
          color: theme.palette.accent,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ============================================
// CLASSIC-ARCHITECTURAL — архитектурный журнал
// Толстые горизонтальные правила, симметрия, серьёзная типографика
// ============================================
function CoverClassicArchitectural({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, estimate } = data;
  const spotsCount = countSpots(estimate);
  const heroImageUrl = master.coverPhotoUrl || estimate.room3dPreviewUrl || "";
  const price = fmtPriceParts(estimate.total);
  const BORDO = theme.palette.accent; // #6B2737

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: "#FFFFFF",
        color: "#000000",
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Толстое правило сверху и снизу — архитектурный журнал */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 8,
          backgroundColor: "#000000",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 8,
          backgroundColor: "#000000",
        }}
      />

      {/* Шапка */}
      <View
        style={{
          position: "absolute",
          top: 30,
          left: 48,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#000000",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 7,
            color: "#000000",
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          № {estimate.id.slice(0, 8).toUpperCase()} · {fmtDate(estimate.createdAt)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image src={master.logoUrl} style={{ width: 24, height: 24, marginRight: 10 }} />
          ) : null}
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 14,
              color: "#000000",
              letterSpacing: 0.5,
            }}
          >
            {master.companyName.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Eyebrow centered */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 110,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 8,
            color: BORDO,
            letterSpacing: 4.5,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          Проект потолка · персональное предложение
        </Text>
      </View>

      {/* Имя клиента — гигантское серифом по центру */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 140,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: fonts.display.weight as 400 | 700 | 800,
            fontSize: 62,
            color: "#000000",
            lineHeight: 1.0,
            letterSpacing: -1,
            textAlign: "center",
          }}
        >
          {estimate.clientName}
        </Text>
        {estimate.clientAddress && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 10,
              color: "#525252",
              lineHeight: 1.5,
              marginTop: 16,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            {estimate.clientAddress}
          </Text>
        )}
      </View>

      {/* Двойная толстая линия */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 280,
          height: 3,
          backgroundColor: "#000000",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 286,
          height: 1,
          backgroundColor: "#000000",
        }}
      />

      {/* Hero photo — широкая полоса, симметрично */}
      {heroImageUrl && (
        <View
          style={{
            position: "absolute",
            left: 48,
            right: 48,
            top: 304,
            height: 280,
          }}
        >
          <Image
            src={heroImageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </View>
      )}

      {/* Двойная линия снизу фото */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 595,
          height: 1,
          backgroundColor: "#000000",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 601,
          height: 3,
          backgroundColor: "#000000",
        }}
      />

      {/* Hero-stats — 4 колонки симметрично, с вертикальными правилами */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          top: 620,
          flexDirection: "row",
        }}
      >
        <StatClassic label="Помещений" value={String(estimate.rooms.length)} theme={theme} fonts={fonts} first />
        <StatClassic label="Кв.метров" value={estimate.totalArea.toFixed(1).replace(".", ",")} theme={theme} fonts={fonts} />
        <StatClassic label={spotsCount > 0 ? "Точек света" : "Дней работы"} value={spotsCount > 0 ? String(spotsCount) : "5–7"} theme={theme} fonts={fonts} />
        <StatClassic label="Гарантия" value="10 лет" theme={theme} fonts={fonts} />
      </View>

      {/* Цена — крупно по центру внизу, бордо */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 70,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: "#000000",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 7,
              color: "#525252",
              letterSpacing: 2.5,
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Под ключ
          </Text>
          {estimate.validUntil && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 8,
                color: "#525252",
                letterSpacing: 0.3,
              }}
            >
              до {fmtDate(estimate.validUntil)}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: fonts.display.weight as 400 | 700 | 800,
              fontSize: 46,
              color: BORDO,
              lineHeight: 1,
              letterSpacing: -0.5,
            }}
          >
            {price.num}
          </Text>
          <Text
            style={{
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 24,
              color: BORDO,
              marginLeft: 6,
            }}
          >
            ₸
          </Text>
        </View>
      </View>

      {/* QR */}
      {data.qrDataUrl && (
        <Image
          src={data.qrDataUrl}
          style={{ position: "absolute", right: 48, bottom: 25, width: 36, height: 36 }}
        />
      )}
      <Text
        style={{
          position: "absolute",
          left: 48,
          bottom: 32,
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: "#525252",
          letterSpacing: 2,
        }}
      >
        {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function StatClassic({
  label,
  value,
  theme,
  fonts,
  first,
}: {
  label: string;
  value: string;
  theme: PdfData["theme"];
  fonts: PdfData["fonts"];
  first?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        borderLeftWidth: first ? 0 : 0.5,
        borderLeftColor: "#000000",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: fonts.display.weight as 400 | 700 | 800,
          fontSize: 30,
          color: theme.palette.accent,
          marginBottom: 4,
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: "#000000",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ============================================
// BOLD-COLOR — Tesla keynote / Awwwards
// Гигантская типографика на цветном поле, бруталистичный
// ============================================
function CoverBoldColor({
  data,
  pageNum,
  totalPages,
}: {
  data: PdfData;
  pageNum: number;
  totalPages: number;
}) {
  const { theme, fonts, master, estimate } = data;
  const spotsCount = countSpots(estimate);
  const heroImageUrl = master.coverPhotoUrl || estimate.room3dPreviewUrl || "";
  const price = fmtPriceParts(estimate.total);
  const ACCENT = theme.palette.accent;
  const TEXT = theme.palette.coverText; // white или dark в зависимости от accent
  const SOFT_TEXT = theme.palette.coverMuted;

  return (
    <Page
      size="A4"
      style={{
        backgroundColor: ACCENT,
        color: TEXT,
        fontFamily: fonts.body.family,
        padding: 0,
      }}
    >
      {/* Гигантская полупрозрачная цифра суммы помещений */}
      <Text
        style={{
          position: "absolute",
          left: -30,
          top: -40,
          fontFamily: fonts.display.family,
          fontWeight: 800,
          fontSize: 460,
          color: TEXT,
          opacity: 0.08,
          lineHeight: 0.85,
          letterSpacing: -10,
        }}
      >
        {String(estimate.rooms.length)}
      </Text>

      {/* Hero photo маленьким окошком внизу справа (если есть) */}
      {heroImageUrl && (
        <View
          style={{
            position: "absolute",
            right: 48,
            top: 110,
            width: 200,
            height: 140,
          }}
        >
          <Image src={heroImageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </View>
      )}

      {/* Шапка */}
      <View
        style={{
          position: "absolute",
          top: 48,
          left: 48,
          right: 48,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {master.logoUrl ? (
            <Image src={master.logoUrl} style={{ width: 28, height: 28, marginRight: 10 }} />
          ) : null}
          <Text
            style={{
              fontFamily: fonts.display.family,
              fontWeight: 800,
              fontSize: 12,
              color: TEXT,
              letterSpacing: -0.3,
            }}
          >
            {master.companyName}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: 800,
            fontSize: 9,
            color: TEXT,
            letterSpacing: 2,
          }}
        >
          № {estimate.id.slice(0, 8).toUpperCase()}
        </Text>
      </View>

      {/* Гигантское имя клиента — занимает половину страницы */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 320,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.body.family,
            fontSize: 9,
            color: SOFT_TEXT,
            letterSpacing: 3,
            textTransform: "uppercase",
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          → Проект потолка для
        </Text>
        <Text
          style={{
            fontFamily: fonts.display.family,
            fontWeight: 800,
            fontSize: 86,
            color: TEXT,
            lineHeight: 0.92,
            letterSpacing: -3,
          }}
        >
          {estimate.clientName.split(" ")[0]}.
        </Text>
        {estimate.clientAddress && (
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 11,
              color: SOFT_TEXT,
              marginTop: 18,
              maxWidth: 360,
              lineHeight: 1.4,
            }}
          >
            {estimate.clientAddress}
          </Text>
        )}
      </View>

      {/* Толстая линия 4pt */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 280,
          height: 3,
          backgroundColor: TEXT,
        }}
      />

      {/* Hero-stats — в виде «спецификации» как Tesla */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 200,
          flexDirection: "row",
        }}
      >
        <StatBold label="помещений" value={String(estimate.rooms.length)} text={TEXT} muted={SOFT_TEXT} fonts={fonts} />
        <StatBold label="м²" value={estimate.totalArea.toFixed(1).replace(".", ",")} text={TEXT} muted={SOFT_TEXT} fonts={fonts} />
        {spotsCount > 0 && (
          <StatBold label="точек света" value={String(spotsCount)} text={TEXT} muted={SOFT_TEXT} fonts={fonts} />
        )}
        <StatBold label="дней" value="5–7" text={TEXT} muted={SOFT_TEXT} fonts={fonts} />
      </View>

      {/* Цена — гигантская, доминирующая */}
      <View
        style={{
          position: "absolute",
          left: 48,
          right: 48,
          bottom: 70,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: fonts.body.family,
              fontSize: 9,
              color: SOFT_TEXT,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            Цена под ключ
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: 800,
                fontSize: 64,
                color: TEXT,
                lineHeight: 0.95,
                letterSpacing: -2.5,
              }}
            >
              {price.num}
            </Text>
            <Text
              style={{
                fontFamily: fonts.display.family,
                fontWeight: 800,
                fontSize: 28,
                color: TEXT,
                marginLeft: 8,
              }}
            >
              {price.cur}
            </Text>
          </View>
          {estimate.validUntil && (
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 9,
                color: SOFT_TEXT,
                marginTop: 8,
              }}
            >
              действительна до {fmtDate(estimate.validUntil)}
            </Text>
          )}
        </View>
        {data.qrDataUrl && (
          <View style={{ alignItems: "flex-end" }}>
            <Image
              src={data.qrDataUrl}
              style={{ width: 70, height: 70, backgroundColor: "#FFFFFF", padding: 4 }}
            />
            <Text
              style={{
                fontFamily: fonts.body.family,
                fontSize: 7,
                color: SOFT_TEXT,
                marginTop: 6,
                letterSpacing: 1,
              }}
            >
              3D-онлайн
            </Text>
          </View>
        )}
      </View>

      <Text
        style={{
          position: "absolute",
          left: 48,
          bottom: 32,
          fontFamily: fonts.display.family,
          fontWeight: 800,
          fontSize: 8,
          color: TEXT,
          letterSpacing: 2,
        }}
      >
        {String(pageNum).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function StatBold({
  label,
  value,
  text,
  muted,
  fonts,
}: {
  label: string;
  value: string;
  text: string;
  muted: string;
  fonts: PdfData["fonts"];
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: fonts.body.family,
          fontSize: 7,
          color: muted,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          fontWeight: 800,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fonts.display.family,
          fontWeight: 800,
          fontSize: 28,
          color: text,
          lineHeight: 1,
          letterSpacing: -1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
