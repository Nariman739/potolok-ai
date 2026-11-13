import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "@react-pdf/renderer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
  // Прокси EAS Update (04.11.2026, «OTA-Россия», src/lib/eas-proxy.ts).
  // eas-cli умеет подменять только ХОСТ: updates.url = https://potolok.ai/<projectId>,
  // ассеты = https://potolok.ai/<hash>?project=…. Корневых динамических страниц
  // на сайте нет; afterFiles — существующие страницы и файлы приоритетнее.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: "/6823c39a-b031-4e6c-945e-39a2d1d06c51",
          destination: "/api/eas/manifest",
        },
        {
          // Ключ ассета EAS — 43 символа base64url; «?project=» отличает его от чего угодно ещё.
          source: "/:hash([A-Za-z0-9_-]{43})",
          has: [{ type: "query", key: "project" }],
          destination: "/api/eas/assets/:hash",
        },
      ],
      fallback: [],
    };
  },
  async redirects() {
    return [
      {
        source: "/app.apk",
        destination:
          "https://fair9vfim2s9dykm.public.blob.vercel-storage.com/app-1.0.38-34.apk",
        permanent: false,
      },
    ];
  },
  async headers() {
    // Явные MIME-типы для 3D-ассетов. Safari бывает капризен к .hdr/.glb без
    // корректного Content-Type; заодно длинный кэш — файлы иммутабельны.
    // Страницы и файлы с данными заказчика — не индексировать (13.11.2026).
    // Вторая линия к metadata.robots: мета-тег есть только в HTML, а PDF наряда
    // и ответы API несут те же имя, телефон и адрес. В robots.txt эти пути НЕ
    // закрыты намеренно — иначе поисковик не увидит запрет и покажет голый адрес.
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      ...["/n/:path*", "/z/:path*", "/kp/:path*", "/contract/:path*", "/act/:path*", "/visual/:path*", "/api/:path*"].map(
        (source) => ({ source, headers: noindex }),
      ),
      {
        source: "/hdri/:path*.hdr",
        headers: [
          { key: "Content-Type", value: "image/vnd.radiance" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/models/:path*.glb",
        headers: [
          { key: "Content-Type", value: "model/gltf-binary" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Текстуры пола/стен близнеца Room3D (копии из приложения, меняются только
        // вместе с именем файла) — тот же длинный кэш, что у hdri/models.
        source: "/textures/app/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

// Sentry wrapper:
//   - автоматически инструментирует API routes и server components
//   - аплоадит source maps в Sentry для трекинга стэков (требует SENTRY_AUTH_TOKEN
//     на build environment — если нет, билд НЕ падает, source maps просто
//     не аплоадятся)
//   - silent: true чтобы build-log не засорять Sentry messages
//   - widenClientFileUpload: true — захватывать все chunks Next.js
//   - hideSourceMaps: true — не оставлять .map в публичной выдаче (привет
//     reverse engineering)
//
// Если NEXT_PUBLIC_SENTRY_DSN не задан — Sentry SDK no-op'ит, билд работает.
export default withSentryConfig(nextConfig, {
  // Org и project на стороне Sentry:
  org: process.env.SENTRY_ORG || "jamix",
  project: process.env.SENTRY_PROJECT || "potolok-ai-web",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Source maps загружаются в Sentry (для нормальных стэков), но не
  // публикуются как .map в выдаче — sourcemaps.deleteSourcemapsAfterUpload.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Tunnel для обхода адблокеров (опционально, отключено пока):
  // tunnelRoute: "/monitoring",
});
