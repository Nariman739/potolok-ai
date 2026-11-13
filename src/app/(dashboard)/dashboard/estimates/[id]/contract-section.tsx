"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  type PaymentStage,
} from "./contract-terms-dialog";
import { Pencil } from "lucide-react";
import { whatsappNumber } from "@/lib/phone-format";
import { CONTRACT_OTHER_CHOSEN_TEXT, MASTER_CONTRACT_REPLACED_TEXT } from "@/lib/estimate-replace-text";

type Props = {
  estimateId: string;
  contractPublicId: string | null;
  contractCreatedAt: string | null;
  contractSignedAt: string | null;
  contractSignerName: string | null;
  /** Мастер выбрал другой вариант — этот неподписанный договор больше не действует (13.11.2026). */
  contractReplaced?: boolean;
  /** Не принятое КП, а в объекте клиент выбрал другой вариант — договор здесь не создаём. */
  otherChosen?: boolean;
  clientPhone: string | null;
  /** Незаполненные реквизиты — показываем мастеру, чего не хватает. */
  missingRequisites: string[];
  defaultPrepaymentPercent: number;
  workStartDate: string | null;
  workDurationDays: number | null;
  paymentSchedule: PaymentStage[] | null;
};

/**
 * Чего не хватает в реквизитах мастера. Договор создаётся и показывается при любых реквизитах
 * (как в приложении), поэтому мастер должен видеть, что именно клиент НЕ увидит в документе.
 */
function MissingRequisites({ fields, existing }: { fields: string[]; existing: boolean }) {
  if (fields.length === 0) return null;
  const noType = fields.includes("Тип договора");
  return (
    <div role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">{existing ? "В этом договоре не заполнено:" : "В договоре не будет заполнено:"}</p>
      <ul className="mt-1 list-disc pl-5">
        {fields.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800">
        {noType && "Тип договора не выбран — документ оформляется как от физического лица. "}
        {existing
          ? "Клиент видит документ без этих данных. Заполните их в профиле — договор по той же ссылке обновится сам."
          : "Договор создастся и так, но клиент увидит документ без этих данных."}{" "}
        <Link href="/dashboard/profile" className="underline font-semibold">
          Заполнить в профиле
        </Link>
      </p>
    </div>
  );
}

export function ContractSection({
  estimateId,
  contractPublicId,
  contractCreatedAt,
  contractSignedAt,
  contractSignerName,
  contractReplaced = false,
  otherChosen = false,
  clientPhone,
  missingRequisites,
  defaultPrepaymentPercent,
  workStartDate,
  workDurationDays,
  paymentSchedule,
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
    const phone = whatsappNumber(clientPhone);
    const wa = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank");
  }

  if (!contractPublicId && otherChosen) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Электронный договор
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
            {CONTRACT_OTHER_CHOSEN_TEXT}
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
          <MissingRequisites fields={missingRequisites} existing={false} />
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
          ) : contractReplaced ? (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" variant="secondary">
              Не действует
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
        ) : contractReplaced ? (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
            {MASTER_CONTRACT_REPLACED_TEXT}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Создан{" "}
              {contractCreatedAt
                ? new Date(contractCreatedAt).toLocaleString("ru-RU")
                : ""}
            </p>
            {/* Договор уже у клиента, но ещё не подписан: реквизиты подставляются при открытии. */}
            <MissingRequisites fields={missingRequisites} existing />
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {/* Недействующий договор клиенту не отправляем — только просмотр */}
          {!contractReplaced && (
            <>
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {copied ? "Скопировано" : "Копировать ссылку"}
              </Button>
              <Button variant="outline" size="sm" onClick={whatsappShare}>
                WhatsApp
              </Button>
            </>
          )}
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
              href={`/api/estimates/${estimateId}/contract?web=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              PDF
            </a>
          </Button>
          {!isSigned && !contractReplaced && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTermsOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Изменить условия
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
      <ContractTermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        onConfirm={createContract}
        saving={creating}
        defaultPrepaymentPercent={defaultPrepaymentPercent}
        initialWorkStartDate={workStartDate}
        initialWorkDurationDays={workDurationDays}
        initialPaymentSchedule={paymentSchedule}
      />
    </Card>
  );
}
