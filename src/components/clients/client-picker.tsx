"use client";

import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X, Users } from "lucide-react";

type ClientHit = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
};

export type ClientPickerValue = {
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
};

export function ClientPicker({
  value,
  onChange,
  initialClientId,
}: {
  value: ClientPickerValue;
  onChange: (v: ClientPickerValue) => void;
  initialClientId?: string;
}) {
  const [allClients, setAllClients] = useState<ClientHit[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeField, setActiveField] = useState<"name" | "phone" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        setAllClients(
          (data as ClientHit[]).map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone ?? null,
            address: c.address ?? null,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialClientId || value.clientId) return;
    const found = allClients.find((c) => c.id === initialClientId);
    if (found) {
      onChange({
        clientId: found.id,
        clientName: found.name,
        clientPhone: found.phone ?? "",
        clientAddress: found.address ?? "",
      });
    }
  }, [initialClientId, allClients, value.clientId, onChange]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const query = (
    activeField === "phone" ? value.clientPhone : value.clientName
  )
    .toLowerCase()
    .trim();

  const suggestions = query
    ? allClients
        .filter((c) => {
          if (
            activeField === "phone" &&
            c.phone &&
            c.phone.replace(/\D/g, "").includes(query.replace(/\D/g, ""))
          )
            return true;
          if (c.name.toLowerCase().includes(query)) return true;
          return false;
        })
        .slice(0, 5)
    : allClients.slice(0, 5);

  function pick(c: ClientHit) {
    onChange({
      clientId: c.id,
      clientName: c.name,
      clientPhone: c.phone ?? "",
      clientAddress: c.address ?? "",
    });
    setShowSuggestions(false);
  }

  function clearLink() {
    onChange({
      clientId: null,
      clientName: value.clientName,
      clientPhone: value.clientPhone,
      clientAddress: value.clientAddress,
    });
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {value.clientId && (
        <div className="flex items-center justify-between rounded-md border bg-emerald-50 px-3 py-2 text-sm">
          <span className="inline-flex items-center gap-2 text-emerald-800">
            <Users className="h-4 w-4" />
            Связано с клиентом из CRM
          </span>
          <button
            type="button"
            onClick={clearLink}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Отвязать"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative">
        <Label htmlFor="cp-name">Имя клиента</Label>
        <div className="relative">
          <Input
            id="cp-name"
            value={value.clientName}
            onChange={(e) =>
              onChange({
                ...value,
                clientId: null,
                clientName: e.target.value,
              })
            }
            onFocus={() => {
              setActiveField("name");
              setShowSuggestions(true);
            }}
            placeholder="Иван"
          />
          {!value.clientName && (
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="cp-phone">Телефон</Label>
        <Input
          id="cp-phone"
          value={value.clientPhone}
          onChange={(e) =>
            onChange({
              ...value,
              clientId: null,
              clientPhone: e.target.value,
            })
          }
          onFocus={() => {
            setActiveField("phone");
            setShowSuggestions(true);
          }}
          placeholder="+7 777 123-45-67"
          type="tel"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && !value.clientId && (
        <div className="rounded-md border bg-white shadow-sm">
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b">
            Существующие клиенты
          </div>
          <div className="max-h-56 overflow-y-auto">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-b-0"
              >
                <div className="font-medium text-sm">{c.name}</div>
                {c.phone && (
                  <div className="text-xs text-muted-foreground">{c.phone}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="cp-address">Адрес</Label>
        <Input
          id="cp-address"
          value={value.clientAddress}
          onChange={(e) =>
            onChange({
              ...value,
              clientAddress: e.target.value,
            })
          }
          placeholder="Адрес объекта"
        />
      </div>

      {!value.clientId && (value.clientName || value.clientPhone) && (
        <p className="text-[11px] text-muted-foreground">
          Если такого клиента ещё нет в CRM — он создастся автоматически при сохранении КП
        </p>
      )}

      {allClients.length > 0 && !value.clientId && !value.clientName && !value.clientPhone && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setActiveField("name");
            setShowSuggestions(true);
          }}
        >
          <Users className="h-3 w-3 mr-1" />
          Выбрать из CRM ({allClients.length})
        </Button>
      )}
    </div>
  );
}
