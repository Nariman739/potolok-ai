"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import type { MasterProfile } from "@/lib/types";

export default function ProfilePage() {
  const [master, setMaster] = useState<MasterProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [brandColor, setBrandColor] = useState("#1e3a5f");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [address, setAddress] = useState("");

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
      })
      .finally(() => setLoading(false));
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
            <Label>Цвет бренда</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border"
              />
              <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-32" />
              <div
                className="h-10 flex-1 rounded-lg flex items-center justify-center text-white text-sm font-medium"
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
              <Input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="+77001234567" />
            </div>
          </div>
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
    </div>
  );
}
