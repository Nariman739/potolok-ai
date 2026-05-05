"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Trash2,
  Plus,
  FileText,
  ExternalLink,
  Ruler,
  FileSignature,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
} from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  SOURCE_LABELS,
  EVENT_LABELS,
  MANUAL_EVENT_TYPES,
  type DealStatusKey,
  type ClientSourceKey,
  type EventTypeKey,
} from "../constants";
import { PhotoGallery, type ObjectPhoto, type PhotoCategoryKey } from "@/components/clients/photo-gallery";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  source: ClientSourceKey | null;
  status: DealStatusKey;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type Event = {
  id: string;
  type: EventTypeKey;
  content: string | null;
  createdAt: string;
};

type Estimate = {
  id: string;
  publicId: string;
  total: number;
  totalArea: number;
  status: string;
  createdAt: string;
};

type Measurement = {
  id: string;
  address: string;
  totalArea: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  rooms: { id: string; name: string; area: number; photoUrls: string[] }[];
};

type Contract = {
  estimateId: string;
  publicId: string;
  contractPublicId: string;
  contractCreatedAt: string | null;
  contractSignedAt: string | null;
  contractSignerName: string | null;
  total: number;
};

const STATUSES: DealStatusKey[] = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATING",
  "WON",
  "LOST",
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) +
    ", " +
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0")
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  SENT: "Отправлено",
  VIEWED: "Просмотрено",
  CONFIRMED: "Подтверждено",
  REJECTED: "Отклонено",
  REVISED: "Пересмотрено",
};

export function ClientCard({
  client: initialClient,
  events: initialEvents,
  estimates,
  measurements,
  photos,
  contracts,
}: {
  client: Client;
  events: Event[];
  estimates: Estimate[];
  measurements: Measurement[];
  photos: ObjectPhoto[];
  contracts: Contract[];
}) {
  const router = useRouter();
  const [client, setClient] = useState<Client>(initialClient);
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [editing, setEditing] = useState(false);
  const [busy, startTransition] = useTransition();
  const [eventType, setEventType] = useState<EventTypeKey>("NOTE");
  const [eventContent, setEventContent] = useState("");
  const [eventBusy, setEventBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftName, setDraftName] = useState(client.name);
  const [draftPhone, setDraftPhone] = useState(client.phone ?? "");
  const [draftAddress, setDraftAddress] = useState(client.address ?? "");
  const [draftNotes, setDraftNotes] = useState(client.notes ?? "");
  const [draftSource, setDraftSource] = useState<ClientSourceKey | "">(
    client.source ?? "",
  );

  const totalSum = estimates.reduce((s, e) => s + (e.total || 0), 0);
  const signedContractsCount = contracts.filter((c) => c.contractSignedAt)
    .length;
  const lastEvent = events[0];

  async function changeStatus(status: DealStatusKey) {
    if (status === client.status) return;
    setClient((c) => ({ ...c, status }));
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Ошибка");
      router.refresh();
    } catch {
      setClient(initialClient);
    }
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim() || client.name,
          phone: draftPhone.trim() || null,
          address: draftAddress.trim() || null,
          notes: draftNotes.trim() || null,
          source: draftSource || null,
        }),
      });
      if (!res.ok) throw new Error("Ошибка");
      const updated = await res.json();
      setClient((c) => ({
        ...c,
        name: updated.name,
        phone: updated.phone,
        address: updated.address,
        notes: updated.notes,
        source: updated.source,
      }));
      setEditing(false);
      router.refresh();
    } catch {
      // оставляем форму открытой
    } finally {
      setSaving(false);
    }
  }

  async function addEvent() {
    if (!eventContent.trim() && eventType === "NOTE") return;
    setEventBusy(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: eventType,
          content: eventContent.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Ошибка");
      const event = await res.json();
      setEvents((prev) => [
        {
          id: event.id,
          type: event.type,
          content: event.content,
          createdAt: event.createdAt,
        },
        ...prev,
      ]);
      setEventContent("");
      setEventType("NOTE");
    } finally {
      setEventBusy(false);
    }
  }

  async function deleteClient() {
    if (
      !confirm(
        "Удалить клиента и все его события? Связанные КП останутся, но без привязки к клиенту.",
      )
    )
      return;
    startTransition(async () => {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard/clients");
      }
    });
  }

  function copyContractLink(publicId: string) {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/contract/${publicId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          К клиентам
        </Link>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold truncate">{client.name}</h1>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge
                      className={STATUS_COLORS[client.status]}
                      variant="secondary"
                    >
                      {STATUS_LABELS[client.status]}
                    </Badge>
                    {client.source && (
                      <span className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[client.source]}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    Редактировать
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={deleteClient}
                    disabled={busy}
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="flex items-center gap-2 hover:text-[#1e3a5f]"
                  >
                    <Phone className="h-4 w-4" />
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Телефон не указан</span>
                )}
                {client.address ? (
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {client.address}
                  </span>
                ) : null}
              </div>

              {client.notes && (
                <p className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">
                  {client.notes}
                </p>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-2">Сменить статус</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => {
                    const active = client.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => changeStatus(s)}
                        className={
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                          (active
                            ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                            : "border-border bg-white text-muted-foreground hover:border-[#1e3a5f]/40")
                        }
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Имя"
              />
              <Input
                value={draftPhone}
                onChange={(e) => setDraftPhone(e.target.value)}
                placeholder="Телефон"
                type="tel"
              />
              <Input
                value={draftAddress}
                onChange={(e) => setDraftAddress(e.target.value)}
                placeholder="Адрес"
              />
              <Input
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                placeholder="Заметка"
              />
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "INSTAGRAM",
                    "WHATSAPP",
                    "REFERRAL",
                    "SITE",
                    "KASPI",
                    "OTHER",
                  ] as ClientSourceKey[]
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setDraftSource(draftSource === s ? "" : s)
                    }
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (draftSource === s
                        ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                        : "border-border bg-white text-muted-foreground")
                    }
                  >
                    {SOURCE_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setDraftName(client.name);
                    setDraftPhone(client.phone ?? "");
                    setDraftAddress(client.address ?? "");
                    setDraftNotes(client.notes ?? "");
                    setDraftSource(client.source ?? "");
                  }}
                >
                  Отмена
                </Button>
                <Button
                  onClick={saveEdit}
                  disabled={saving}
                  className="bg-[#1e3a5f] hover:bg-[#152d4a]"
                >
                  {saving ? "Сохраняю…" : "Сохранить"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="events">События ({events.length})</TabsTrigger>
          <TabsTrigger value="measurements">
            Замеры ({measurements.length})
          </TabsTrigger>
          <TabsTrigger value="estimates">КП ({estimates.length})</TabsTrigger>
          <TabsTrigger value="contracts">
            Договор ({contracts.length})
          </TabsTrigger>
          <TabsTrigger value="photos">Фото ({photos.length})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCell label="КП" value={estimates.length} />
            <SummaryCell label="Замеры" value={measurements.length} />
            <SummaryCell label="Фото" value={photos.length} />
            <SummaryCell
              label="Договоры"
              value={`${signedContractsCount}/${contracts.length}`}
            />
          </div>
          {totalSum > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Сумма всех КП
                </span>
                <span className="text-lg font-bold">{formatMoney(totalSum)} ₸</span>
              </CardContent>
            </Card>
          )}
          {lastEvent && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">
                  Последнее событие
                </p>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="font-medium text-[#1e3a5f]">
                      {EVENT_LABELS[lastEvent.type]}
                    </span>
                    {lastEvent.content && (
                      <span className="truncate">— {lastEvent.content}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDateTime(lastEvent.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* EVENTS */}
        <TabsContent value="events" className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {MANUAL_EVENT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setEventType(t.key)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (eventType === t.key
                        ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                        : "border-border bg-white text-muted-foreground")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={eventContent}
                  onChange={(e) => setEventContent(e.target.value)}
                  placeholder="Что обсуждали / результат"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !eventBusy) addEvent();
                  }}
                />
                <Button
                  onClick={addEvent}
                  disabled={eventBusy}
                  className="bg-[#1e3a5f] hover:bg-[#152d4a]"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Событий пока нет
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#1e3a5f]">
                        {EVENT_LABELS[e.type]}
                      </div>
                      {e.content && (
                        <div className="text-sm mt-0.5 whitespace-pre-wrap">
                          {e.content}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {formatDateTime(e.createdAt)}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* MEASUREMENTS */}
        <TabsContent value="measurements" className="space-y-3">
          {measurements.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <Ruler className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Замеров пока нет — создайте на вкладке «Замеры»
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/dashboard/vision-test">
                  <Plus className="h-3 w-3 mr-1" />
                  Создать замер
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {measurements.map((m) => {
                const allPhotos = m.rooms.flatMap((r) => r.photoUrls).slice(0, 4);
                return (
                  <Card key={m.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {m.address || "Без адреса"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.rooms.length} комнат · {m.totalArea.toFixed(1)} м² · {formatDate(m.updatedAt)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {m.status === "saved" ? "сохранён" : "активен"}
                        </Badge>
                      </div>
                      {allPhotos.length > 0 && (
                        <div className="grid grid-cols-4 gap-1.5">
                          {allPhotos.map((url, i) => (
                            <div
                              key={i}
                              className="relative aspect-square rounded-md overflow-hidden bg-muted"
                            >
                              <Image
                                src={url}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="80px"
                                unoptimized
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ESTIMATES */}
        <TabsContent value="estimates" className="space-y-3">
          <div className="flex justify-end">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <Link
                href={`/dashboard/quick-estimate?clientId=${client.id}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Создать КП для этого клиента
              </Link>
            </Button>
          </div>
          {estimates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              КП пока нет
            </p>
          ) : (
            <div className="space-y-2">
              {estimates.map((est) => (
                <Link key={est.id} href={`/dashboard/estimates/${est.id}`}>
                  <Card className="cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {formatMoney(est.total)} ₸
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {ESTIMATE_STATUS_LABELS[est.status] ?? est.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {est.totalArea.toFixed(1)} м² ·{" "}
                          {formatDateTime(est.createdAt)}
                        </div>
                      </div>
                      <a
                        href={`/kp/${est.publicId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[#1e3a5f] hover:underline inline-flex items-center gap-1 flex-shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                        ссылка
                      </a>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CONTRACTS */}
        <TabsContent value="contracts" className="space-y-3">
          {contracts.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <FileSignature className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Договоров пока нет. Создайте договор на странице КП.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {contracts.map((c) => {
                const signed = !!c.contractSignedAt;
                return (
                  <Card
                    key={c.estimateId}
                    className={signed ? "border-emerald-300" : ""}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileSignature className="h-4 w-4 text-[#1e3a5f]" />
                            <span className="font-medium">
                              {formatMoney(c.total)} ₸
                            </span>
                            {signed ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" variant="secondary">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Подписан
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Ожидает подписи
                              </Badge>
                            )}
                          </div>
                          {signed && c.contractSignerName && (
                            <p className="text-xs mt-1">
                              <strong>{c.contractSignerName}</strong> ·{" "}
                              {c.contractSignedAt &&
                                formatDateTime(c.contractSignedAt)}
                            </p>
                          )}
                          {!signed && c.contractCreatedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Создан {formatDateTime(c.contractCreatedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyContractLink(c.contractPublicId)}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Скопировать ссылку
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/contract/${c.contractPublicId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Открыть
                          </a>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/estimates/${c.estimateId}`}>
                            КП →
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* PHOTOS */}
        <TabsContent value="photos">
          <PhotoGallery clientId={client.id} initialPhotos={photos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCell({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
