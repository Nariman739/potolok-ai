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
    return [
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
