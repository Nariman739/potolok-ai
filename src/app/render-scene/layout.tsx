import type { Metadata } from "next";

// Служебная страница серверного рендера (headless Chromium воркера). Не для людей.
export const metadata: Metadata = {
  title: "render",
  robots: { index: false, follow: false },
};

export default function RenderSceneLayout({ children }: { children: React.ReactNode }) {
  return children;
}
