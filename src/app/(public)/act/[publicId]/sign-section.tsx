"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature } from "lucide-react";
import { tFor, type Lang } from "@/lib/i18n";
import "@/lib/i18n/contract";

export function ActSignSection({
  publicId,
  lang = "ru",
  remarksSentAt = null,
}: {
  publicId: string;
  lang?: Lang;
  /** Когда заказчик уже отправлял замечания — показываем это вместо формы. */
  remarksSentAt?: string | null;
}) {
  const t = tFor(lang);
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // «Есть замечания» — намеренно маленькая ссылка, а не вторая большая кнопка:
  // главный путь «принял и подписал», отказ — по желанию (Нариман 27.09.2026).
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [remarksSent, setRemarksSent] = useState<string | null>(remarksSentAt);

  async function sendRemarks() {
    if (remarks.trim().length < 5 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/act/${publicId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: remarks.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("sign.error"));
      setRemarksSent(new Date().toLocaleString(lang === "kk" ? "kk-KZ" : "ru-KZ"));
      setRemarksOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sign.error"));
    } finally {
      setSubmitting(false);
    }
  }

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
      if (!res.ok) throw new Error(data?.error ?? t("sign.error"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sign.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-[#1e3a5f]/40 shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-[#1e3a5f]" />
          <h2 className="text-lg font-bold">{t("sign.act.title")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("sign.act.hint")}
        </p>

        <div className="space-y-3">
          <div>
            <Label htmlFor="signer-name">{t("sign.fio")}</Label>
            <Input
              id="signer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sign.fioPlaceholder")}
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
              {t("sign.act.consent")}
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
          )}
        </div>

        {remarksSent && (
          <p className="text-sm rounded bg-amber-50 text-amber-800 p-3">
            {t("sign.act.remarksSent", { date: remarksSent })}
          </p>
        )}
        {remarksOpen ? (
          <div className="space-y-2 rounded border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-sm text-muted-foreground">{t("sign.act.remarksHint")}</p>
            <textarea
              id="act-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={t("sign.act.remarksPlaceholder")}
              rows={4}
              className="w-full rounded border border-gray-300 bg-white p-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={sendRemarks} disabled={remarks.trim().length < 5 || submitting}>
                {submitting ? t("sign.saving") : t("sign.act.remarksSend")}
              </Button>
              <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setRemarksOpen(false)}>
                {t("sign.act.remarksBack")}
              </button>
            </div>
          </div>
        ) : null}
        <Button
          size="lg"
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={!canSubmit || submitting}
          onClick={submit}
        >
          {submitting ? (
            t("sign.saving")
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              {t("sign.act.submit")}
            </>
          )}
        </Button>
        {!remarksOpen && (
          <p className="text-center">
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setRemarksOpen(true)}>
              {t("sign.act.remarksLink")}
            </button>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
