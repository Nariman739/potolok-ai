"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature } from "lucide-react";

export function ActSignSection({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 3 && agreed;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/act/${publicId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: name.trim(),
          agreed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-[#1e3a5f]/40 shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-[#1e3a5f]" />
          <h2 className="text-lg font-bold">Подтвердить приёмку работ</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Подтверждая акт вы соглашаетесь, что работы выполнены в полном объёме, в установленные сроки и претензий по объёму, качеству и срокам не имеете.
        </p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="signer-name">ФИО (как в удостоверении) *</Label>
            <Input
              id="signer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иванов Иван Иванович"
              autoComplete="off"
            />
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            <span>
              Я принял работы и претензий не имею. Понимаю, что моё подтверждение фиксируется электронно с указанием времени и IP-адреса.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
          )}
        </div>

        <Button
          size="lg"
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={!canSubmit || submitting}
          onClick={submit}
        >
          {submitting ? (
            "Сохраняем…"
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Принять работы и подписать
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
