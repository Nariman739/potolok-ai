"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSignature,
  Copy,
  ExternalLink,
  Download,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  ContractTermsDialog,
  type ContractTermsPayload,
} from "./contract-terms-dialog";

type Props = {
  estimateId: string;
  contractPublicId: string | null;
  contractCreatedAt: string | null;
  contractSignedAt: string | null;
  contractSignerName: string | null;
  clientPhone: string | null;
  contractConfigured: boolean;
  defaultPrepaymentPercent: number;
};

export function ContractSection({
  estimateId,
  contractPublicId,
  contractCreatedAt,
  contractSignedAt,
  contractSignerName,
  clientPhone,
  contractConfigured,
  defaultPrepaymentPercent,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createContract(payload: ContractTermsPayload) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/estimates/${estimateId}/contract/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Ошибка");
      setTermsOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  }

  function getContractUrl() {
    if (!contractPublicId) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/contract/${contractPublicId}`;
  }

  async function copyLink() {
    const url = getContractUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  function whatsappShare() {
    const url = getContractUrl();
    if (!url) return;
    const text = `Здравствуйте! Договор на работы по натяжному потолку: ${url}\n\nОткройте по ссылке и подтвердите согласие.`;
    const phone = clientPhone?.replace(/\D/g, "");
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank");
  }

  if (!contractConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Электронный договор
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Заполните реквизиты в профиле, чтобы создать электронный договор.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!contractPublicId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Электронный договор
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Создайте договор и отправьте клиенту ссылку. Клиент откроет в браузере и подпишет электронно — без распечатки. Все данные сохранятся в карточке клиента.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={() => setTermsOpen(true)}
            disabled={creating}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Создаю…
              </>
            ) : (
              <>
                <FileSignature className="h-4 w-4 mr-2" /> Создать электронный договор
              </>
            )}
          </Button>
        </CardContent>
        <ContractTermsDialog
          open={termsOpen}
          onOpenChange={setTermsOpen}
          onConfirm={createContract}
          saving={creating}
          defaultPrepaymentPercent={defaultPrepaymentPercent}
        />
      </Card>
    );
  }

  const isSigned = !!contractSignedAt;

  return (
    <Card className={isSigned ? "border-emerald-300" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4" />
          Электронный договор
          {isSigned ? (
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" variant="secondary">
              Подписан
            </Badge>
          ) : (
            <Badge variant="secondary">Ожидает подписи</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSigned ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-800">
                  {contractSignerName}
                </p>
                <p className="text-xs text-emerald-700">
                  {contractSignedAt
                    ? new Date(contractSignedAt).toLocaleString("ru-RU")
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Создан{" "}
            {contractCreatedAt
              ? new Date(contractCreatedAt).toLocaleString("ru-RU")
              : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {copied ? "Скопировано" : "Копировать ссылку"}
          </Button>
          <Button variant="outline" size="sm" onClick={whatsappShare}>
            WhatsApp
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/contract/${contractPublicId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Открыть
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/estimates/${estimateId}/contract`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
