"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { User, X, Search, Plus } from "lucide-react";

type ClientHit = {
  id: string;
  name: string;
  phone: string | null;
};

export function LinkClientButton({
  clientId,
  clientName,
  clientPhone,
  onChange,
}: {
  clientId: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  onChange: (next: { id: string | null; name: string | null; phone: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ClientHit[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setList(data as ClientHit[]))
      .catch(() => {});
  }, [open]);

  const filtered = search.trim()
    ? list.filter((c) => {
        const q = search.toLowerCase();
        const qDigits = q.replace(/\D/g, "");
        if (c.name.toLowerCase().includes(q)) return true;
        if (qDigits && c.phone && c.phone.replace(/\D/g, "").includes(qDigits))
          return true;
        return false;
      })
    : list.slice(0, 30);

  function pick(c: ClientHit) {
    onChange({ id: c.id, name: c.name, phone: c.phone });
    setOpen(false);
  }

  async function createNew() {
    if (!newName.trim() && !newPhone.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || null,
          phone: newPhone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      const c = await res.json();
      onChange({ id: c.id, name: c.name, phone: c.phone ?? null });
      setOpen(false);
      setCreating(false);
      setNewName("");
      setNewPhone("");
    } catch {
      // оставим окно открытым
    } finally {
      setBusy(false);
    }
  }

  function unlink() {
    onChange({ id: null, name: null, phone: null });
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm bg-white">
        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        {clientId ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{clientName || "Клиент"}</div>
              {clientPhone && (
                <div className="text-xs text-muted-foreground truncate">
                  {clientPhone}
                </div>
              )}
            </div>
            <button
              onClick={() => setOpen(true)}
              className="text-xs text-[#1e3a5f] hover:underline flex-shrink-0"
            >
              Изменить
            </button>
            <button
              onClick={unlink}
              className="text-muted-foreground hover:text-red-600 flex-shrink-0"
              aria-label="Отвязать"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex-1 text-left text-muted-foreground hover:text-[#1e3a5f]"
          >
            Привязать к клиенту
          </button>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setCreating(false);
            setSearch("");
            setNewName("");
            setNewPhone("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creating ? "Новый клиент" : "Выбрать клиента"}
            </DialogTitle>
          </DialogHeader>

          {!creating ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или телефону"
                  className="pl-9"
                />
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {list.length === 0
                      ? "Клиентов пока нет — создайте нового"
                      : "Никого не нашли"}
                  </p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pick(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50"
                    >
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.phone && (
                        <div className="text-xs text-muted-foreground">
                          {c.phone}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать нового
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Имя"
              />
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Телефон"
                type="tel"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCreating(false)}
                >
                  Назад
                </Button>
                <Button
                  className="flex-1 bg-[#1e3a5f] hover:bg-[#152d4a]"
                  onClick={createNew}
                  disabled={busy || (!newName.trim() && !newPhone.trim())}
                >
                  {busy ? "..." : "Создать"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
