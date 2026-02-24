import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "PotolokAI — Умный расчёт натяжных потолков",
    template: "%s | PotolokAI",
  },
  description: "Мгновенный расчёт стоимости натяжных потолков. Создавайте профессиональные коммерческие предложения за секунды.",
  keywords: "натяжные потолки, расчёт, калькулятор, коммерческое предложение, КП, мастер",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${montserrat.variable} font-sans antialiased`}>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
