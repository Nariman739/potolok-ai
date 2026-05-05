"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Calculator,
  FileText,
  DollarSign,
  User,
  LogOut,
  MessageSquare,
  Ruler,
  ImageIcon,
  Zap,
  Users,
  Crown,
} from "lucide-react";
import { FeedbackButton } from "@/components/feedback-button";
import { Logo } from "@/components/logo";

const navItems = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/dashboard/assistant", label: "Ассистент", icon: MessageSquare },
  { href: "/dashboard/clients", label: "Клиенты", icon: Users },
  { href: "/dashboard/vision-test", label: "Замеры", icon: Ruler },
  { href: "/dashboard/calculator", label: "Калькулятор", icon: Calculator },
  { href: "/dashboard/estimates", label: "Расчёты", icon: FileText },
  { href: "/dashboard/quick-estimate", label: "Быстрое КП", icon: Zap },
  { href: "/dashboard/portfolio", label: "Портфолио", icon: ImageIcon },
  { href: "/dashboard/prices", label: "Цены", icon: DollarSign },
  { href: "/dashboard/profile", label: "Профиль", icon: User },
];

export function Sidebar({ isOwner = false }: { isOwner?: boolean }) {
  const pathname = usePathname();

  const items = isOwner
    ? [
        ...navItems,
        { href: "/dashboard/admin", label: "Админ", icon: Crown },
      ]
    : navItems;

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <Logo size="sm" variant="dark" />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#1e3a5f] text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 space-y-1">
        <FeedbackButton variant="sidebar" />
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </button>
        </form>
      </div>
    </aside>
  );
}
