"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight, Building2, Loader2, Lock, Pencil, RotateCcw, Save, Sparkles } from "lucide-react";
import { bodyToFrame, damagedTags, frameToBody, structureOf } from "./_components/contract-frame";

/**
 * «Мой договор» на сайте (09.11.2026) — то же, что экран приложения, по тем же
 * API. Отдел продаж работает с компьютера и настраивает всё здесь.
 *
 * Текст договора — HTML с метками {клиент}, {сумма}: они подставляются из
 * заказа при печати. Каждое сохранение — новая версия, прошлые остаются.
 * Шаблон принадлежит компании, правит его владелец.
 */

type Lang = "ru" | "kk";
type Version = { id: string; version: number; note: string | null; createdAt: string; isActive: boolean };
type Template = Version & { body: string; language: string };
type Info = { template: Template | null; history: Version[]; canEdit: boolean };

/** Что сейчас на экране: действующий текст, заготовка, несохранённая правка или старая версия. */
type Shown =
  | { kind: "active"; body: string; version: number; note: string | null; createdAt: string }
  | { kind: "starter"; body: string }
  | { kind: "draft"; body: string; note: string; warning: string | null; problem: string | null }
  | { kind: "old"; body: string; version: number; createdAt: string };

const LANGS: { code: Lang; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
];
const CHIPS = ["Предоплата 30%", "Гарантия на монтаж 3 года", "Добавь пункт: мусор вывозим сами"];
const STARTER_NOTE = "Типовой договор";
const MANUAL_NOTE = "Правка вручную";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/contract${url}`, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || "Ошибка сервера", res.status);
  return data as T;
}

const postJson = (payload: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal,
});

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ContractPage() {
  const [lang, setLang] = useState<Lang>("ru");
  const [info, setInfo] = useState<Info | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  // Отмена ручной правки: перезагружаем фрейм, иначе в нём останется набранное.
  const [frameKey, setFrameKey] = useState(0);
  // Пропали метки или обязательное (409): объясняем, решает владелец.
  const [confirm, setConfirm] = useState<{ body: string; note: string; message: string; force: boolean } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const structureRef = useRef("");
  // Заготовка на каждый язык — тянем один раз.
  const starterRef = useRef<Partial<Record<Lang, string>>>({});

  const loadStarter = useCallback(async (l: Lang): Promise<string> => {
    const cached = starterRef.current[l];
    if (cached) return cached;
    const r = await api<{ body: string }>(`/template/starter?lang=${l}`);
    starterRef.current[l] = r.body;
    return r.body;
  }, []);

  const load = useCallback(
    async (l: Lang) => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<Info>(`/template?lang=${l}`);
        setInfo(r);
        if (r.template) {
          const tp = r.template;
          setShown({ kind: "active", body: tp.body, version: tp.version, note: tp.note, createdAt: tp.createdAt });
        } else {
          setShown({ kind: "starter", body: await loadStarter(l) });
        }
      } catch (e) {
        // Не оставляем на экране текст другого языка под видом этого.
        setShown(null);
        setError(e instanceof Error ? e.message : "Не удалось загрузить договор");
      } finally {
        setLoading(false);
      }
    },
    [loadStarter],
  );

  useEffect(() => {
    void load(lang);
  }, [lang, load]);

  const unsaved = editing || shown?.kind === "draft";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const frameDoc = () => frameRef.current?.contentDocument ?? null;

  useEffect(() => {
    if (!editing) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.contentEditable = "true";
    doc.body.focus();
    structureRef.current = structureOf(doc);
    // Режим включается один раз на вход: shown во время правки не меняется.
  }, [editing]);

  const canEdit = info?.canEdit ?? false;
  const locked = busy || saving || editing;

  /** Несохранённая правка пропадёт — спрашиваем, прежде чем уйти с неё. */
  const mayLeaveDraft = () =>
    shown?.kind !== "draft" || window.confirm("Несохранённые правки пропадут. Продолжить?");

  const changeLang = (l: Lang) => {
    if (l !== lang && mayLeaveDraft()) setLang(l);
  };

  /** Вернуть на экран действующий текст (или заготовку, если своего нет). */
  const showCurrent = useCallback(async () => {
    if (info?.template) {
      const tp = info.template;
      setShown({ kind: "active", body: tp.body, version: tp.version, note: tp.note, createdAt: tp.createdAt });
    } else {
      setShown({ kind: "starter", body: await loadStarter(lang) });
    }
  }, [info, lang, loadStarter]);

  const rewrite = async () => {
    const text = ask.trim();
    if (!shown || locked) return;
    if (text.length < 3) {
      toast.error("Скажите, что поменять в договоре");
      return;
    }
    setBusy(true);
    try {
      // Модель переписывает весь договор — это 30–60 с.
      const r = await api<{ body: string; warning: string | null; problem: string | null }>(
        "/rewrite",
        postJson({ body: shown.body, ask: text, language: lang }, AbortSignal.timeout(90_000)),
      );
      // Несколько правок подряд до сохранения — в историю попадут все.
      const note = shown.kind === "draft" ? `${shown.note}; ${text}` : text;
      setShown({ kind: "draft", body: r.body, note: note.slice(0, 300), warning: r.warning, problem: r.problem });
      setAsk("");
    } catch (e) {
      // Текст просьбы остаётся в поле — можно отправить ещё раз.
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      toast.error(timedOut ? "Помощник не успел ответить. Попробуйте ещё раз" : e instanceof Error ? e.message : "Не получилось переписать");
    } finally {
      setBusy(false);
    }
  };

  const save = async (body: string, note: string, force = false): Promise<void> => {
    setSaving(true);
    try {
      await api("/template", postJson({ body, note, language: lang, force }));
      toast.success("Договор сохранён");
      setEditing(false);
      await load(lang);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConfirm({ body, note, message: e.message, force: true });
      } else {
        toast.error(e instanceof Error ? e.message : "Не удалось сохранить");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveManual = () => {
    const doc = frameDoc();
    if (!doc || !shown) return;
    const body = frameToBody(doc, shown.body, structureRef.current);
    if (body === shown.body) {
      setEditing(false);
      doc.body.removeAttribute("contenteditable");
      toast.info("Изменений нет");
      return;
    }
    const note = (shown.kind === "draft" ? `${shown.note}; ${MANUAL_NOTE}` : MANUAL_NOTE).slice(0, 300);
    const { lost, broken } = damagedTags(shown.body, body);
    if (lost.length > 0 || broken.length > 0) {
      const message = [
        lost.length > 0 ? `Из текста пропали метки: ${lost.join(", ")}.` : "",
        broken.length > 0 ? `Разорваны оформлением и не подставятся: ${broken.join(", ")}.` : "",
        "На их месте в договоре не будет данных заказа.",
      ].filter(Boolean).join(" ");
      setConfirm({ body, note, message, force: false });
      return;
    }
    void save(body, note);
  };

  const cancelManual = () => {
    setEditing(false);
    setFrameKey((k) => k + 1);
  };

  const openVersion = async (v: Version) => {
    if (!mayLeaveDraft()) return;
    if (v.isActive) {
      await showCurrent();
      return;
    }
    try {
      const r = await api<{ template: Template }>(`/template/${v.id}`);
      setShown({ kind: "old", body: r.template.body, version: r.template.version, createdAt: r.template.createdAt });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось открыть версию");
    }
  };

  const resetToStarter = async () => {
    if (!mayLeaveDraft()) return;
    try {
      const body = await loadStarter(lang);
      setShown({ kind: "draft", body, note: STARTER_NOTE, warning: null, problem: null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить заготовку");
    }
  };

  const html = useMemo(() => (shown ? bodyToFrame(shown.body) : ""), [shown]);
  const editButton = canEdit && !editing && (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={locked || loading}>
      <Pencil className="mr-2 h-4 w-4" />
      Править вручную
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Мой договор</h1>
          <p className="text-sm text-muted-foreground">
            Текст, который получит клиент. Жёлтым — что подставится из заказа: клиент, адрес, сумма.
          </p>
        </div>
        {/* Язык документа: у компании может быть свой текст на каждом языке. */}
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <Button
              key={l.code}
              size="sm"
              variant={lang === l.code ? "default" : "outline"}
              onClick={() => changeLang(l.code)}
              disabled={locked || loading}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {editing ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e3a5f]/40 bg-white p-3">
              <p className="min-w-0 flex-1 text-sm">
                Меняйте текст прямо в документе. Жёлтые метки не удаляйте: на их место подставятся данные заказа.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelManual} disabled={saving}>
                  Отмена
                </Button>
                <Button size="sm" onClick={saveManual} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Сохранить версию
                </Button>
              </div>
            </div>
          ) : (
            <>
              {shown?.kind === "active" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      Версия {shown.version} · {dateTime(shown.createdAt)}
                      {shown.note ? ` · ${shown.note}` : ""}
                    </p>
                    <p className="text-muted-foreground">Так будет выглядеть каждый новый договор. Подписанные не меняются, неподписанные покажут новый текст.</p>
                  </div>
                  {editButton}
                </div>
              )}
              {shown?.kind === "starter" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e3a5f]/30 bg-[#1e3a5f]/5 p-3">
                  <p className="min-w-0 flex-1 text-sm">
                    Это типовой договор. Скажите, что поменять, или поправьте вручную — и он станет вашим.
                  </p>
                  {editButton}
                </div>
              )}
              {shown?.kind === "draft" && (
                <div className="space-y-2 rounded-lg border border-[#1e3a5f]/40 bg-white p-3">
                  <p className="text-sm font-medium">
                    {shown.note === STARTER_NOTE ? "Типовой договор. Проверьте и сохраните" : "Помощник переписал. Проверьте текст"}
                  </p>
                  {shown.warning && <p className="text-sm text-amber-700">Помощник предупреждает: {shown.warning}</p>}
                  {shown.problem && <p className="text-sm text-destructive">{shown.problem}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void showCurrent()} disabled={locked}>
                      Отмена
                    </Button>
                    {editButton}
                    <Button size="sm" onClick={() => void save(shown.body, shown.note)} disabled={locked}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Сохранить
                    </Button>
                  </div>
                </div>
              )}
              {shown?.kind === "old" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1e3a5f]/40 bg-white p-3">
                  <p className="min-w-0 flex-1 text-sm font-medium">
                    Версия {shown.version} от {dateTime(shown.createdAt)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void showCurrent()} disabled={locked}>
                      Закрыть
                    </Button>
                    {canEdit && (
                      <Button size="sm" onClick={() => void save(shown.body, `Возврат к версии ${shown.version}`)} disabled={locked}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        Вернуть эту версию
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className={`relative overflow-hidden rounded-lg border bg-white ${editing ? "ring-2 ring-[#1e3a5f]" : ""}`}>
            {!shown ? (
              <div className="flex h-[75vh] flex-col items-center justify-center gap-3 p-6">
                {loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <p className="text-sm text-destructive">{error}</p>
                    <Button size="sm" onClick={() => void load(lang)}>
                      Повторить
                    </Button>
                  </>
                )}
              </div>
            ) : (
              // Без allow-scripts: текст приходит от ИИ, скрипты в нём не выполняются.
              // allow-same-origin нужен, чтобы забрать правку из документа.
              <iframe
                key={frameKey}
                ref={frameRef}
                title="Текст договора"
                srcDoc={html}
                sandbox="allow-same-origin"
                className="h-[75vh] w-full"
              />
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0f1f33]/40">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Реквизиты
              </CardTitle>
              <CardDescription>БИН/ИИН, банк, город и гарантии подставляются в договор из профиля.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/dashboard/profile?section=contract">
                  Заполнить реквизиты
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {info && !canEdit ? (
            <div className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              Договор меняет владелец компании
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" />
                  Правка словами
                </CardTitle>
                <CardDescription>Помощник перепишет текст, вы проверите и сохраните.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAsk(chip)}
                      disabled={locked}
                      className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="Что поменять? Например: предоплата 30%"
                  maxLength={1000}
                  rows={3}
                  disabled={locked}
                />
                <Button className="w-full" onClick={() => void rewrite()} disabled={locked || !shown || !ask.trim()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {busy ? "Переписываю, до минуты…" : "Переписать"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">История версий</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(info?.history ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Пока только типовой договор</p>
              )}
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {(info?.history ?? []).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void openVersion(v)}
                    disabled={locked}
                    className="flex w-full items-start gap-2 rounded-md p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        Версия {v.version} · {dateTime(v.createdAt)}
                      </span>
                      {v.note && <span className="line-clamp-2 text-xs text-muted-foreground">{v.note}</span>}
                    </span>
                    {v.isActive && <Badge variant="secondary">действующая</Badge>}
                  </button>
                ))}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void resetToStarter()}
                  disabled={locked}
                  className="flex w-full items-start gap-2 rounded-md border-t p-2 pt-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">Типовой договор</span>
                    <span className="block text-xs text-muted-foreground">
                      Вернуться к заготовке — прошлые версии останутся в истории
                    </span>
                  </span>
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сохранить всё равно?</DialogTitle>
            <DialogDescription>{confirm?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirm) return;
                const { body, note, force } = confirm;
                setConfirm(null);
                void save(body, note, force);
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
