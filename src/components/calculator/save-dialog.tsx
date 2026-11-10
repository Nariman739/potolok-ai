"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClientPicker } from "@/components/clients/client-picker";

export type SaveDialogPayload = {
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  clientAddress: string;
};

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: SaveDialogPayload) => void;
  saving: boolean;
  /** Клиент замера: выбран сразу, менять можно. */
  initialClientId?: string | null;
}

export function SaveDialog({ open, onOpenChange, onSave, saving, initialClientId }: SaveDialogProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  // Клиента замера подставляем один раз: после «Отвязать» он не должен вернуться сам.
  const [initialApplied, setInitialApplied] = useState(false);

  function handleSave() {
    onSave({ clientId, clientName, clientPhone, clientAddress });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* На телефоне с подсказками клиентов диалог выше экрана — пусть прокручивается, а не прячет «Сохранить» */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Сохранить КП</DialogTitle>
          <DialogDescription>
            {clientId ? "Клиент из CRM подставлен, можно изменить" : "Выберите клиента из CRM или введите данные нового"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <ClientPicker
            value={{ clientId, clientName, clientPhone, clientAddress }}
            initialClientId={initialApplied ? undefined : initialClientId ?? undefined}
            onChange={(v) => {
              if (v.clientId && v.clientId === initialClientId) setInitialApplied(true);
              setClientId(v.clientId);
              setClientName(v.clientName);
              setClientPhone(v.clientPhone);
              setClientAddress(v.clientAddress);
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
