"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Undo2, Trash2, FileText, Users, Ruler, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/format";

type ModelKind = "estimates" | "clients" | "measurements" | "variants";

type EstimateItem = {
  id: string;
  clientName: string | null;
  totalArea: number;
  total: number;
  standardTotal: number | null;
  deletedAt: string;
};

type ClientItem = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  deletedAt: string;
};

type MeasurementItem = {
  id: string;
  address: string;
  totalArea: number;
  deletedAt: string;
};

type VariantItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  photoUrl: string | null;
  deletedAt: string;
};

interface Props {
  estimates: EstimateItem[];
  clients: ClientItem[];
  measurements: MeasurementItem[];
  variants: VariantItem[];
}

const RESTORE_URLS: Record<ModelKind, (id: string) => string> = {
  estimates: (id) => `/api/estimates/${id}/restore`,
  clients: (id) => `/api/clients/${id}/restore`,
  measurements: (id) => `/api/measurements/${id}/restore`,
  variants: (id) => `/api/prices/variants/${id}/restore`,
};

const PERMANENT_DELETE_URLS: Record<ModelKind, (id: string) => string> = {
  estimates: (id) => `/api/estimates/${id}/permanent-delete`,
  clients: (id) => `/api/clients/${id}/permanent-delete`,
  measurements: (id) => `/api/measurements/${id}/permanent-delete`,
  variants: (id) => `/api/prices/variants/${id}/permanent-delete`,
};

const KIND_LABELS: Record<ModelKind, string> = {
  estimates: "КП",
  clients: "клиента",
  measurements: "замер",
  variants: "вариант прайса",
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${Math.max(1, diffMin)} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD} дн назад`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function TrashClient({ estimates, clients, measurements, variants }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<{ kind: ModelKind; id: string; label: string } | null>(null);

  async function handleRestore(kind: ModelKind, id: string) {
    const res = await fetch(RESTORE_URLS[kind](id), { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Ошибка восстановления");
      return;
    }
    toast.success(`Восстановлено: ${KIND_LABELS[kind]}`);
    startTransition(() => router.refresh());
  }

  async function handlePermanentDelete() {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    const res = await fetch(PERMANENT_DELETE_URLS[kind](id), { method: "POST" });
    setConfirmDelete(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Ошибка удаления");
      return;
    }
    toast.success(`Удалено навсегда: ${KIND_LABELS[kind]}`);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Tabs defaultValue="estimates">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="estimates" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">КП</span>
            <Badge variant="secondary" className="ml-1">{estimates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Клиенты</span>
            <Badge variant="secondary" className="ml-1">{clients.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="measurements" className="gap-2">
            <Ruler className="h-4 w-4" />
            <span className="hidden sm:inline">Замеры</span>
            <Badge variant="secondary" className="ml-1">{measurements.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="variants" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Прайсы</span>
            <Badge variant="secondary" className="ml-1">{variants.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estimates" className="mt-4 space-y-2">
          {estimates.length === 0 ? (
            <EmptyState text="Удалённых КП нет" />
          ) : (
            estimates.map((e) => (
              <Card key={e.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {e.clientName || "Клиент не указан"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {e.totalArea > 0 ? `${e.totalArea.toFixed(1)} м² · ` : ""}
                    {formatPrice(e.total || e.standardTotal || 0)} · удалено {formatRelativeDate(e.deletedAt)}
                  </p>
                </div>
                <RowActions
                  disabled={isPending}
                  onRestore={() => handleRestore("estimates", e.id)}
                  onPermanentDelete={() =>
                    setConfirmDelete({ kind: "estimates", id: e.id, label: e.clientName || "КП" })
                  }
                />
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="clients" className="mt-4 space-y-2">
          {clients.length === 0 ? (
            <EmptyState text="Удалённых клиентов нет" />
          ) : (
            clients.map((c) => (
              <Card key={c.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.phone ?? "без телефона"} · {c.status} · удалён {formatRelativeDate(c.deletedAt)}
                  </p>
                </div>
                <RowActions
                  disabled={isPending}
                  onRestore={() => handleRestore("clients", c.id)}
                  onPermanentDelete={() =>
                    setConfirmDelete({ kind: "clients", id: c.id, label: c.name })
                  }
                />
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="measurements" className="mt-4 space-y-2">
          {measurements.length === 0 ? (
            <EmptyState text="Удалённых замеров нет" />
          ) : (
            measurements.map((m) => (
              <Card key={m.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{m.address || "Без адреса"}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.totalArea > 0 ? `${m.totalArea.toFixed(1)} м² · ` : ""}
                    удалён {formatRelativeDate(m.deletedAt)}
                  </p>
                </div>
                <RowActions
                  disabled={isPending}
                  onRestore={() => handleRestore("measurements", m.id)}
                  onPermanentDelete={() =>
                    setConfirmDelete({ kind: "measurements", id: m.id, label: m.address || "Замер" })
                  }
                />
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="variants" className="mt-4 space-y-2">
          {variants.length === 0 ? (
            <EmptyState text="Удалённых вариантов прайса нет" />
          ) : (
            variants.map((v) => (
              <Card key={v.id} className="p-4 flex items-center justify-between gap-3">
                {v.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={v.photoUrl}
                    alt={v.name}
                    className="h-12 w-12 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{v.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {v.category} · {formatPrice(v.price)} · удалён {formatRelativeDate(v.deletedAt)}
                  </p>
                </div>
                <RowActions
                  disabled={isPending}
                  onRestore={() => handleRestore("variants", v.id)}
                  onPermanentDelete={() =>
                    setConfirmDelete({ kind: "variants", id: v.id, label: v.name })
                  }
                />
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить навсегда?</DialogTitle>
            <DialogDescription>
              {confirmDelete && (
                <>
                  Действие необратимо. {KIND_LABELS[confirmDelete.kind]} <b>«{confirmDelete.label}»</b> исчезнет
                  безвозвратно вместе со связанными данными.
                  {confirmDelete.kind === "variants" && " Фото из хранилища также удалится."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={isPending}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handlePermanentDelete} disabled={isPending}>
              Удалить навсегда
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RowActions({
  onRestore,
  onPermanentDelete,
  disabled,
}: {
  onRestore: () => void;
  onPermanentDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-2 flex-shrink-0">
      <Button size="sm" variant="outline" onClick={onRestore} disabled={disabled}>
        <Undo2 className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">Вернуть</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onPermanentDelete} disabled={disabled}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="p-8 text-center text-sm text-muted-foreground">{text}</Card>
  );
}
