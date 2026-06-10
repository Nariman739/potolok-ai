"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Copy,
  FileDown,
  Plus,
  Radar,
  Search,
  Trash2,
  Pencil,
} from "lucide-react";

type Status = "AVAILABLE" | "RESERVED" | "ACTIVATED" | "SOLD";

type Owner = { id: string; name: string; phone: string } | null;

type Rangefinder = {
  id: string;
  serial: string | null;
  name: string;
  mac: string;
  token: string;
  bleKey: string | null;
  qrCode: string | null;
  status: Status;
  ownerId: string | null;
  owner: Owner;
  note: string | null;
  activatedAt: string | null;
  createdAt: string;
};

type MasterOption = { id: string; name: string; phone: string };

const STATUS_LABELS: Record<Status, string> = {
  AVAILABLE: "На складе",
  RESERVED: "Забронирована",
  ACTIVATED: "Активирована",
  SOLD: "Выдана",
};

const STATUS_COLORS: Record<Status, string> = {
  AVAILABLE: "bg-zinc-200 text-zinc-700",
  RESERVED: "bg-amber-100 text-amber-800",
  ACTIVATED: "bg-emerald-100 text-emerald-800",
  SOLD: "bg-blue-100 text-blue-800",
};

const STATUS_ORDER: Status[] = ["AVAILABLE", "RESERVED", "ACTIVATED", "SOLD"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}

export function RangefindersPanel({
  rangefinders,
  masters,
}: {
  rangefinders: Rangefinder[];
  masters: MasterOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [editing, setEditing] = useState<Rangefinder | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let list = rangefinders;
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.mac.toLowerCase().includes(q) ||
          r.token.toLowerCase().includes(q) ||
          (r.serial?.toLowerCase().includes(q) ?? false) ||
          (r.qrCode?.toLowerCase().includes(q) ?? false) ||
          (r.owner?.name.toLowerCase().includes(q) ?? false) ||
          (r.owner?.phone.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [rangefinders, search, statusFilter]);

  const summary = useMemo(() => {
    const s: Record<Status, number> = {
      AVAILABLE: 0,
      RESERVED: 0,
      ACTIVATED: 0,
      SOLD: 0,
    };
    for (const r of rangefinders) s[r.status]++;
    return s;
  }, [rangefinders]);

  return (
    <div className="container mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            className="text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Админ
          </Link>
          <div className="flex items-center gap-2">
            <Radar className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold">Рулетки</h1>
            <Badge variant="outline">{rangefinders.length}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const eligible = filtered.filter((r) => r.qrCode);
              if (!eligible.length) {
                alert("В фильтре нет рулеток с QR-кодом для печати.");
                return;
              }
              const ids = eligible.map((r) => r.id).join(",");
              window.open(
                `/api/admin/rangefinders/stickers?ids=${encodeURIComponent(ids)}`,
                "_blank",
              );
            }}
            className="gap-2"
            title="Распечатать QR-стикеры для текущего фильтра"
          >
            <FileDown className="w-4 h-4" /> PDF стикеров
          </Button>
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Добавить рулетку
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STATUS_ORDER.map((s) => (
          <Card key={s}>
            <CardContent className="p-4">
              <div className="text-xs text-zinc-500">{STATUS_LABELS[s]}</div>
              <div className="text-2xl font-bold mt-1">{summary[s]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Поиск: имя, MAC, token, QR, мастер..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "ALL" | Status)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Все статусы</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b">
              <tr className="text-left">
                <th className="p-3 font-medium">Имя / Serial</th>
                <th className="p-3 font-medium">MAC</th>
                <th className="p-3 font-medium">Token</th>
                <th className="p-3 font-medium">QR код</th>
                <th className="p-3 font-medium">Статус</th>
                <th className="p-3 font-medium">Мастер</th>
                <th className="p-3 font-medium">Добавлена</th>
                <th className="p-3 font-medium w-[1%]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-400">
                    {rangefinders.length === 0
                      ? "Пока ни одной рулетки. Добавь первую через кнопку выше."
                      : "Ничего не найдено по фильтру."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-zinc-50/50 cursor-pointer"
                  onClick={() => setEditing(r)}
                >
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    {r.serial && (
                      <div className="text-xs text-zinc-500">SN: {r.serial}</div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs">{r.mac}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="font-mono text-xs hover:text-emerald-600 inline-flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(r.token);
                      }}
                      title="Скопировать"
                    >
                      {r.token.slice(0, 6)}…{r.token.slice(-4)}
                      <Copy className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="p-3">
                    {r.qrCode ? (
                      <button
                        type="button"
                        className="font-mono text-xs font-bold tracking-wider hover:text-emerald-600 inline-flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(r.qrCode!);
                        }}
                        title="Скопировать"
                      >
                        {r.qrCode}
                        <Copy className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge className={STATUS_COLORS[r.status]}>
                      {STATUS_LABELS[r.status]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {r.owner ? (
                      <div>
                        <div>{r.owner.name}</div>
                        <div className="text-xs text-zinc-500">{r.owner.phone}</div>
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-500 text-xs">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="p-3">
                    <Pencil className="w-4 h-4 text-zinc-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(editing || creating) && (
        <RangefinderDialog
          rangefinder={editing}
          masters={masters}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RangefinderDialog({
  rangefinder,
  masters,
  onClose,
  onSaved,
}: {
  rangefinder: Rangefinder | null;
  masters: MasterOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!rangefinder;
  const [name, setName] = useState(rangefinder?.name ?? "Mi Smart Laser Measure");
  const [mac, setMac] = useState(rangefinder?.mac ?? "");
  const [token, setToken] = useState(rangefinder?.token ?? "");
  const [bleKey, setBleKey] = useState(rangefinder?.bleKey ?? "");
  const [serial, setSerial] = useState(rangefinder?.serial ?? "");
  const [note, setNote] = useState(rangefinder?.note ?? "");
  const [ownerId, setOwnerId] = useState<string | "none">(
    rangefinder?.ownerId ?? "none",
  );
  const [status, setStatus] = useState<Status>(rangefinder?.status ?? "AVAILABLE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        mac,
        token,
        bleKey: bleKey || undefined,
        serial: serial || undefined,
        note: note || undefined,
        ownerId: ownerId === "none" ? null : ownerId,
        status,
      };
      const url = isEdit
        ? `/api/admin/rangefinders/${rangefinder!.id}`
        : "/api/admin/rangefinders";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка");
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    if (!confirm(`Удалить рулетку ${rangefinder!.name}? Это действие необратимо.`))
      return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/rangefinders/${rangefinder!.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Ошибка");
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Редактировать рулетку" : "Новая рулетка"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rf-name">Имя</Label>
            <Input
              id="rf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mi Smart Laser Measure"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rf-mac">MAC</Label>
              <Input
                id="rf-mac"
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                placeholder="D4:43:8A:DA:26:D2"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-serial">Серийный № (опц.)</Label>
              <Input
                id="rf-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="на коробке"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-token">Token (24 hex)</Label>
            <Input
              id="rf-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="b2b76b40c5d2ebfb198aa337"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-blekey">BLE key (32 hex, опц.)</Label>
            <Input
              id="rf-blekey"
              value={bleKey}
              onChange={(e) => setBleKey(e.target.value)}
              placeholder="26d0636967ef2f5242570666e17a9b5c"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Статус</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Мастер</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Без мастера" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без мастера</SelectItem>
                  {masters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-note">Заметка</Label>
            <Input
              id="rf-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="например, партия #1, закуп 12 мая, 10К"
            />
          </div>

          {isEdit && rangefinder!.qrCode && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="text-xs text-zinc-600">QR код для онбординга</div>
              <div className="font-mono text-xl font-bold tracking-wider mt-1">
                {rangefinder!.qrCode}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                Будет напечатан на стикере. Мастер сканит QR в приложении (когда
                выпустим 1.0.5) → token подгрузится автоматически.
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          {isEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={saving}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Удалить
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
