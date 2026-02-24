"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssistant } from "@/hooks/use-assistant";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { SaveKpDialog } from "./save-kp-dialog";
import { Button } from "@/components/ui/button";
import { Bot, Camera, MessageSquare, RotateCcw } from "lucide-react";
import type { ClientInfo } from "@/lib/types";

export function ChatContainer() {
  const router = useRouter();
  const {
    messages,
    sessionId,
    isStreaming,
    isUploading,
    calculationResult,
    clientData,
    sendMessage,
    uploadPhoto,
    startNewSession,
  } = useAssistant();

  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleSaveKp = async (data: ClientInfo) => {
    if (!sessionId) return;

    const res = await fetch("/api/assistant/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        clientName: data.name,
        clientPhone: data.phone,
        clientAddress: data.address,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      setShowSaveDialog(false);
      router.push(`/dashboard/estimates/${result.estimateId}`);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-2rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a5f] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">AI Ассистент</h1>
            <p className="text-xs text-muted-foreground">Расчёт по фото и тексту</p>
          </div>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={startNewSession}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Новый
          </Button>
        )}
      </div>

      {/* Messages or Welcome */}
      {hasMessages ? (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onSaveKp={calculationResult ? () => setShowSaveDialog(true) : undefined}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-6 max-w-sm">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-[#1e3a5f]/10 text-[#1e3a5f]">
              <Bot className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">AI Ассистент</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Отправьте фото тех.паспорта, чертежа дизайнера или напишите размеры комнат
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => sendMessage("Зал 5×4м, 8 спотов, 1 люстра")}
                className="flex flex-col items-center gap-2 rounded-xl border p-3 text-sm hover:bg-muted transition-colors"
              >
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Текстом</span>
                <span className="text-xs font-medium">&quot;Зал 5×4м, 8 спотов&quot;</span>
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>("input[type='file']:not([capture])");
                  input?.click();
                }}
                className="flex flex-col items-center gap-2 rounded-xl border p-3 text-sm hover:bg-muted transition-colors"
              >
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Фото</span>
                <span className="text-xs font-medium">Тех.паспорт / чертёж</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onUploadPhoto={uploadPhoto}
        disabled={isStreaming}
        isUploading={isUploading}
      />

      {/* Save KP dialog */}
      <SaveKpDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveKp}
        prefilled={clientData}
      />
    </div>
  );
}
