"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Loader2, Send, CheckCircle2, Link2Off, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import type { MasterProfile } from "@/lib/types";
import { LogoGeneratorDialog } from "@/components/logo/logo-generator-dialog";

const BOT_USERNAME = "potolokaiBot";

export default function ProfilePage() {
  const [master, setMaster] = useState<MasterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Telegram linking state
  const [tgLinked, setTgLinked] = useState(false);
  const [tgLinkCode, setTgLinkCode] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [brandColor, setBrandColor] = useState("#1e3a5f");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);

  // Contract settings state
  const [contractType, setContractType] = useState("");
  const [bin, setBin] = useState("");
  const [iin, setIin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [kbe, setKbe] = useState("");
  const [bik, setBik] = useState("");
  const [passportData, setPassportData] = useState("");
  const [prepaymentPercent, setPrepaymentPercent] = useState("50");
  const [warrantyMaterials, setWarrantyMaterials] = useState("10");
  const [warrantyInstall, setWarrantyInstall] = useState("2");
  const [contractCity, setContractCity] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setMaster(data);
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setPhone(data.phone || "");
        setCompanyName(data.companyName || "");
        setBrandColor(data.brandColor || "#1e3a5f");
        setInstagramUrl(data.instagramUrl || "");
        setWhatsappPhone(data.whatsappPhone || "");
        setAddress(data.address || "");
        setLogoUrl(data.logoUrl || null);
        // Contract
        setContractType(data.contractType || "");
        setBin(data.bin || "");
        setIin(data.iin || "");
        setLegalName(data.legalName || "");
        setLegalAddress(data.legalAddress || "");
        setBankName(data.bankName || "");
        setIban(data.iban || "");
        setKbe(data.kbe || "");
        setBik(data.bik || "");
        setPassportData(data.passportData || "");
        setPrepaymentPercent(String(data.prepaymentPercent ?? 50));
        setWarrantyMaterials(String(data.warrantyMaterials ?? 10));
        setWarrantyInstall(String(data.warrantyInstall ?? 2));
        setContractCity(data.contractCity || "");
      })
      .finally(() => setLoading(false));

    // Check Telegram link status
    fetch("/api/telegram/link-code")
      .then((r) => r.json())
      .then((data) => setTgLinked(data.linked ?? false))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          companyName,
          brandColor,
          instagramUrl,
          whatsappPhone,
          address,
          contractType: contractType || null,
          bin: bin || null,
          iin: iin || null,
          legalName: legalName || null,
          legalAddress: legalAddress || null,
          bankName: bankName || null,
          iban: iban || null,
          kbe: kbe || null,
          bik: bik || null,
          passportData: passportData || null,
          prepaymentPercent,
          warrantyMaterials,
          warrantyInstall,
          contractCity: contractCity || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Профиль сохранён");
    } catch {
      toast.error("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateCode() {
    setTgLoading(true);
    try {
      const res = await fetch("/api/telegram/link-code", { method: "POST" });
      const data = await res.json();
      if (data.code) setTgLinkCode(data.code);
    } catch {
      toast.error("Ошибка генерации кода");
    } finally {
      setTgLoading(false);
    }
  }

  async function handleUnlink() {
    setTgLoading(true);
    try {
      await fetch("/api/telegram/link-code", { method: "DELETE" });
      setTgLinked(false);
      setTgLinkCode(null);
      toast.success("Telegram отвязан");
    } catch {
      toast.error("Ошибка");
    } finally {
      setTgLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Профиль</h1>

      {/* Personal info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Личные данные</CardTitle>
          <CardDescription>Ваше имя и контакты</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Имя</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Фамилия</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 700 123 4567" />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={master?.email || ""} disabled className="bg-muted" />
          </div>
        </CardContent>
      </Card>

      {/* Telegram notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Telegram уведомления</CardTitle>
          <CardDescription>
            Получайте уведомления когда клиент принимает КП
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tgLinked ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Telegram подключён</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlink}
                disabled={tgLoading}
              >
                <Link2Off className="h-4 w-4 mr-2" />
                Отвязать
              </Button>
            </div>
          ) : tgLinkCode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Нажмите кнопку ниже — откроется бот. Нажмите{" "}
                <strong>Start / Начать</strong> и аккаунт привяжется автоматически.
              </p>
              <Button
                className="w-full bg-[#229ED9] hover:bg-[#1a8fc4] text-white"
                onClick={() =>
                  window.open(
                    `https://t.me/${BOT_USERNAME}?start=${tgLinkCode}`,
                    "_blank"
                  )
                }
              >
                <Send className="h-4 w-4 mr-2" />
                Открыть @{BOT_USERNAME}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={handleGenerateCode}
                disabled={tgLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Новый код
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Привяжите Telegram, чтобы получать мгновенные уведомления
                когда клиент принимает ваше КП.
              </p>
              <Button
                variant="outline"
                onClick={handleGenerateCode}
                disabled={tgLoading}
              >
                {tgLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Привязать Telegram
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Брендинг КП</CardTitle>
          <CardDescription>Как будет выглядеть ваше коммерческое предложение</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Название компании</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Мастер Потолков" />
          </div>

          <div className="space-y-2">
            <Label>Логотип</Label>
            <div className="flex items-center gap-3 flex-wrap">
              {logoUrl ? (
                <div className="relative h-20 w-20 rounded-lg border bg-white overflow-hidden flex-shrink-0">
                  <Image
                    src={logoUrl}
                    alt="Logo"
                    fill
                    className="object-contain"
                    sizes="80px"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="h-20 w-20 rounded-lg border-2 border-dashed bg-muted/30 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                  пусто
                </div>
              )}
              <div className="flex-1 min-w-[150px] space-y-2">
                <Button
                  type="button"
                  onClick={() => setLogoDialogOpen(true)}
                  className="bg-[#1e3a5f] hover:bg-[#152d4a] w-full sm:w-auto"
                  size="sm"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {logoUrl ? "Создать новый с AI" : "Создать с AI"}
                </Button>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!confirm("Удалить логотип?")) return;
                      setRemovingLogo(true);
                      try {
                        const res = await fetch("/api/logo/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ url: "" }),
                        });
                        if (res.ok) setLogoUrl(null);
                      } finally {
                        setRemovingLogo(false);
                      }
                    }}
                    disabled={removingLogo}
                    className="w-full sm:w-auto"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Удалить
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  AI задаст пару вопросов о вашей компании и нарисует логотип
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Цвет бренда</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border"
              />
              <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-28 sm:w-32" />
              <div
                className="h-10 w-full sm:flex-1 sm:w-auto rounded-lg flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: brandColor }}
              >
                Превью цвета
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Адрес</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="г. Астана" />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="@potolki_astana" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                value={whatsappPhone}
                onChange={(e) => {
                  let v = e.target.value;
                  if (!v.startsWith("+7")) {
                    const digits = v.replace(/\D/g, "");
                    v = "+7" + (digits.startsWith("7") ? digits.slice(1) : digits);
                  }
                  setWhatsappPhone(v);
                }}
                onFocus={() => {
                  if (!whatsappPhone) setWhatsappPhone("+7");
                }}
                placeholder="+7 700 123 45 67"
                inputMode="tel"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contract settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Настройки договора</CardTitle>
          <CardDescription>
            Заполните реквизиты для автоматической генерации договоров
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Тип договора</Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger>
                <SelectValue placeholder="Не использую" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не использую</SelectItem>
                <SelectItem value="ip">ИП (Индивидуальный предприниматель)</SelectItem>
                <SelectItem value="individual">Физическое лицо</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ИП fields */}
          {contractType === "ip" && (
            <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Реквизиты ИП</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>БИН</Label>
                  <Input value={bin} onChange={(e) => setBin(e.target.value)} placeholder="123456789012" maxLength={12} />
                </div>
                <div className="space-y-2">
                  <Label>ИИН</Label>
                  <Input value={iin} onChange={(e) => setIin(e.target.value)} placeholder="012345678901" maxLength={12} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Наименование ИП</Label>
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder='ИП "Иванов Иван Иванович"' />
              </div>
              <div className="space-y-2">
                <Label>Юридический адрес</Label>
                <Input value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} placeholder="г. Караганда, ул. Ермекова 1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Банк</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="АО Каспи Банк" />
                </div>
                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="KZ12345678901234567" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>КБе</Label>
                  <Input value={kbe} onChange={(e) => setKbe(e.target.value)} placeholder="19" maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label>БИК</Label>
                  <Input value={bik} onChange={(e) => setBik(e.target.value)} placeholder="CASPKZKA" />
                </div>
              </div>
            </>
          )}

          {/* Individual fields */}
          {contractType === "individual" && (
            <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Данные физического лица</p>
              <div className="space-y-2">
                <Label>ИИН</Label>
                <Input value={iin} onChange={(e) => setIin(e.target.value)} placeholder="012345678901" maxLength={12} />
              </div>
              <div className="space-y-2">
                <Label>ФИО полностью</Label>
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Иванов Иван Иванович" />
              </div>
              <div className="space-y-2">
                <Label>Удостоверение личности (серия и номер)</Label>
                <Input value={passportData} onChange={(e) => setPassportData(e.target.value)} placeholder="№ 012345678" />
              </div>
            </>
          )}

          {/* Common contract settings */}
          {contractType && contractType !== "none" && (
            <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Условия договора</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Предоплата (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={prepaymentPercent}
                    onChange={(e) => setPrepaymentPercent(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Гарантия материалы (лет)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="25"
                    value={warrantyMaterials}
                    onChange={(e) => setWarrantyMaterials(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Гарантия монтаж (лет)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={warrantyInstall}
                    onChange={(e) => setWarrantyInstall(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Город (для шапки договора)</Label>
                <Input value={contractCity} onChange={(e) => setContractCity(e.target.value)} placeholder="г. Караганда" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="bg-[#1e3a5f] hover:bg-[#152d4a]">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Сохранение...
          </>
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Сохранить
          </>
        )}
      </Button>

      <LogoGeneratorDialog
        open={logoDialogOpen}
        onOpenChange={setLogoDialogOpen}
        onSaved={(url) => {
          setLogoUrl(url);
          setLogoDialogOpen(false);
          toast.success("Логотип сохранён");
        }}
      />
    </div>
  );
}
