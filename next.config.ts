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
