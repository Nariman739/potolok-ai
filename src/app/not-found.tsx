import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0F1724] flex flex-col items-center justify-center px-4 text-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(249,115,22,0.08) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-md">
        <div className="mb-8">
          <Logo variant="light" size="lg" />
        </div>

        <p className="text-8xl font-extrabold bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent mb-4">
          404
        </p>

        <h1 className="text-2xl font-bold text-[#F1F5F9] mb-3">
          Страница не найдена
        </h1>

        <p className="text-[#94A3B8] mb-8">
          Возможно, эта страница была удалена или вы перешли по неверной ссылке.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] text-white font-semibold hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 transition-all"
          >
            На главную
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#334155] text-[#F1F5F9] font-semibold hover:border-[#3B82F6] hover:text-[#3B82F6] transition-all"
          >
            В кабинет
          </Link>
        </div>
      </div>
    </div>
  );
}
