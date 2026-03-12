"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/logo";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#0F1724] text-[#F1F5F9]">
      {/* Sticky header with backdrop blur */}
      <header className="sticky top-0 z-50 border-b border-[#334155]/50 bg-[#0F1724]/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="sm" variant="light" />
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
            <a
              href="/auth/login"
              className="hidden md:inline-flex text-sm font-medium text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
            >
              Войти
            </a>
            <a
              href="/auth/register"
              className="hidden sm:inline-flex items-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-2.5 text-sm font-semibold text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 transition-all"
            >
              Начать бесплатно
            </a>

            {/* Mobile hamburger menu */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button suppressHydrationWarning className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-lg text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#1A2332] transition-colors">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Меню</span>
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="bg-[#0F1724] border-[#334155]/50 w-72"
              >
                <SheetHeader>
                  <SheetTitle className="text-[#F1F5F9]">
                    <Logo size="sm" variant="light" />
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4">
                  <SheetClose asChild>
                    <Link
                      href="#features"
                      className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors py-3 text-base"
                    >
                      Возможности
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="#pricing"
                      className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors py-3 text-base"
                    >
                      Тарифы
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="#faq"
                      className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors py-3 text-base"
                    >
                      FAQ
                    </Link>
                  </SheetClose>
                  <Separator className="bg-[#334155]/50 my-2" />
                  <SheetClose asChild>
                    <a
                      href="/auth/login"
                      className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors py-3 text-base"
                    >
                      Войти
                    </a>
                  </SheetClose>
                  <SheetClose asChild>
                    <a
                      href="/auth/register"
                      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-3 text-sm font-semibold text-white mt-2"
                    >
                      Начать бесплатно
                    </a>
                  </SheetClose>
                </nav>
              </SheetContent>
            </Sheet>
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
