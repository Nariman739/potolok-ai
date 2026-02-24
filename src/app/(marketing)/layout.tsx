import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0F1724] text-[#F1F5F9]">
      {/* Sticky header with backdrop blur */}
      <header className="sticky top-0 z-50 border-b border-[#334155]/50 bg-[#0F1724]/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">
              Potolok<span className="text-[#F97316]">AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#94A3B8]">
            <Link href="#features" className="hover:text-[#F1F5F9] transition-colors">
              Возможности
            </Link>
            <Link href="#pricing" className="hover:text-[#F1F5F9] transition-colors">
              Тарифы
            </Link>
            <Link href="#faq" className="hover:text-[#F1F5F9] transition-colors">
              FAQ
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="hidden md:inline-flex text-sm font-medium text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
            >
              Войти
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-2.5 text-sm font-semibold text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 transition-all"
            >
              Начать бесплатно
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#334155]/50 py-8 bg-[#0a1018]">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-[#64748B]">
            &copy; {new Date().getFullYear()} PotolokAI. Казахстан.
          </p>
        </div>
      </footer>
    </div>
  );
}
