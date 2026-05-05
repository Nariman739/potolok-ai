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
}

export function SaveDialog({ open, onOpenChange, onSave, saving }: SaveDialogProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  function handleSave() {
    onSave({ clientId, clientName, clientPhone, clientAddress });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сохранить КП</DialogTitle>
          <DialogDescription>
            Выберите клиента из CRM или введите данные нового
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <ClientPicker
            value={{ clientId, clientName, clientPhone, clientAddress }}
            onChange={(v) => {
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
