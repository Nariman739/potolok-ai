"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { formatPrice, formatDateShort } from "@/lib/format";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SENT: "Отправлено",
  VIEWED: "Просмотрено",
  CONFIRMED: "Подтверждено",
  REJECTED: "Отклонено",
  REVISED: "Пересмотрено",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  REVISED: "bg-orange-100 text-orange-700 border-orange-200",
  CONFIRMED: "bg-green-100 text-green-700 border-green-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
};

interface Estimate {
  id: string;
  clientName: string | null;
  createdAt: Date;
  totalArea: number;
  total: number;
  standardTotal: number | null;
  status: string;
}

export function EstimatesList({ estimates }: { estimates: Estimate[] }) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? estimates.filter((e) =>
        (e.clientName ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : estimates;

  return (
    <div className="space-y-3">
      {estimates.length > 4 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени клиента..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Ничего не найдено
        </p>
      ) : (
        filtered.map((est) => (
          <Link key={est.id} href={`/dashboard/estimates/${est.id}`} className="block">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-semibold">{est.clientName || "Без имени"}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateShort(est.createdAt)} | {est.totalArea.toFixed(1)} м²
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                    <span className="font-bold text-[#1e3a5f] text-sm">
                      {formatPrice(est.total || est.standardTotal || 0)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${STATUS_BADGE_CLASSES[est.status] || ""}`}
                    >
                      {STATUS_LABELS[est.status] || est.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
