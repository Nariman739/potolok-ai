"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const CLIENTS_VIEW_KEY = "clients-view-v1";

// Одна шапка для списка и канбана. Все/Мои — только в команде, у одиночки нечего делить.
export function ClientsHeader({
  total,
  search,
  onSearch,
  placeholder,
  isTeam,
  onlyMine,
  onOnlyMine,
  view,
  showToggle,
  onAdd,
}: {
  total: number;
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  isTeam: boolean;
  onlyMine: boolean;
  onOnlyMine: (v: boolean) => void;
  view: "list" | "board";
  showToggle: boolean;
  onAdd: () => void;
}) {
  // Последний вид помнит только команда: она работает на доске весь день
  const remember = (v: "list" | "board") => {
    if (!isTeam) return;
    try {
      localStorage.setItem(CLIENTS_VIEW_KEY, v);
    } catch {}
  };
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold whitespace-nowrap">
        Клиенты <span className="font-normal text-muted-foreground">· {total}</span>
      </h1>
      <div className="relative min-w-48 flex-1 md:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {isTeam && (
        <div className="flex gap-1">
          <Button size="sm" variant={onlyMine ? "ghost" : "secondary"} onClick={() => onOnlyMine(false)}>
            Все
          </Button>
          <Button size="sm" variant={onlyMine ? "secondary" : "ghost"} onClick={() => onOnlyMine(true)}>
            Мои
          </Button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {showToggle && (
          <div className="hidden gap-1 rounded-lg bg-muted p-1 md:inline-flex">
            <Link href="/dashboard/clients" onClick={() => remember("list")} className={tab(view === "list")}>
              Список
            </Link>
            <Link href="/dashboard/clients?view=board" onClick={() => remember("board")} className={tab(view === "board")}>
              Канбан
            </Link>
          </div>
        )}
        <Button onClick={onAdd} className="bg-[#1e3a5f] hover:bg-[#152d4a]">
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>
    </div>
  );
}
