import { readFileSync } from "node:fs";
import path from "node:path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

let cachedLogoDataUrl: string | null = null;
function getLogoDataUrl(): string {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const logoPath = path.join(process.cwd(), "public", "logo-icon.png");
  const bytes = readFileSync(logoPath);
  cachedLogoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  return cachedLogoDataUrl;
}

export type StickerInput = {
  name: string;
  qrCode: string;
};

type StickerReady = StickerInput & { qrDataUrl: string };

export async function buildStickerData(
  stickers: StickerInput[],
): Promise<StickerReady[]> {
  return Promise.all(
    stickers.map(async (s) => ({
      ...s,
      qrDataUrl: await QRCode.toDataURL(s.qrCode, {
        width: 600,
        margin: 1,
        errorCorrectionLevel: "M",
      }),
    })),
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 18,
    paddingRight: 18,
    backgroundColor: "#fff",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  stickerWrap: {
    width: "50%",
    height: 360,
    padding: 6,
  },
  sticker: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "dashed",
    padding: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandLogo: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  brandText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#1B3FE4",
    letterSpacing: 2,
  },
  qrBox: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  nameBig: {
    fontSize: 22,
    fontWeight: 700,
    color: "#000",
  },
  codeSmall: {
    fontSize: 11,
    color: "#666",
    letterSpacing: 3,
    marginTop: 2,
  },
  hint: {
    fontSize: 8,
    color: "#888",
    marginTop: 4,
    textAlign: "center",
  },
});

export async function renderStickersPdf(stickers: StickerInput[]): Promise<Buffer> {
  const ready = await buildStickerData(stickers);
  return renderToBuffer(<StickersDocument stickers={ready} />);
}

function StickersDocument({ stickers }: { stickers: StickerReady[] }) {
  const pages = chunk(stickers, 4);
  const logoSrc = getLogoDataUrl();
  return (
    <Document title="QR-стикеры рулеток potolok.ai">
      {pages.map((pageStickers, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          <View style={styles.grid}>
            {pageStickers.map((s, i) => (
              <View key={`${pageIdx}-${i}`} style={styles.stickerWrap}>
                <View style={styles.sticker}>
                  <View style={styles.brandRow}>
                    <Image src={logoSrc} style={styles.brandLogo} />
                    <Text style={styles.brandText}>POTOLOK.AI</Text>
                  </View>
                  <View style={styles.qrBox}>
                    <Image src={s.qrDataUrl} style={styles.qrImage} />
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.nameBig}>{s.name}</Text>
                    <Text style={styles.codeSmall}>{s.qrCode}</Text>
                    <Text style={styles.hint}>
                      Scan in potolok.ai mobile app
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
}
