"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Users,
  Ruler,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Клиенты", icon: Users },
  { href: "/dashboard/vision-test", label: "Замеры", icon: Ruler },
  { href: "/dashboard/estimates", label: "КП", icon: FileText },
  { href: "/dashboard/assistant", label: "AI", icon: MessageSquare },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white md:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-1 py-1 text-xs transition-colors",
                isActive
                  ? "text-[#1e3a5f] font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
