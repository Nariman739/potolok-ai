"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus, Send, X, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string, imageUrl?: string) => void;
  onUploadPhoto: (file: File) => Promise<string | null>;
  disabled?: boolean;
  isUploading?: boolean;
}

export function ChatInput({ onSend, onUploadPhoto, disabled, isUploading }: ChatInputProps) {
  const [text, setText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !uploadedUrl) return;

    onSend(trimmed || "Отправлено фото", uploadedUrl || undefined);
    setText("");
    setPreviewUrl(null);
    setUploadedUrl(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, uploadedUrl, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-grow textarea
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // Upload
    const url = await onUploadPhoto(file);
    if (url) {
      setUploadedUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Reset input
    e.target.value = "";
  };

  const removePhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadedUrl(null);
  };

  return (
    <div className="border-t bg-white px-3 py-2 safe-area-bottom">
      {/* Photo preview */}
      {previewUrl && (
        <div className="relative inline-block mb-2">
          <img
            src={previewUrl}
            alt="Preview"
            className="h-20 w-20 object-cover rounded-lg"
          />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
          <button
            type="button"
            onClick={removePhoto}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Gallery button — выбрать из файлов/галереи */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={disabled || isUploading}
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImagePlus className="h-5 w-5" />
        </Button>

        {/* Camera button — сфоткать */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={disabled || isUploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="h-5 w-5" />
        </Button>

        {/* Hidden file inputs */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Размеры или вопрос..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border bg-muted/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 min-h-[44px] max-h-[120px]"
        />

        {/* Send button */}
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 shrink-0 bg-[#1e3a5f] hover:bg-[#152d4a]"
          disabled={disabled || isUploading || (!text.trim() && !uploadedUrl)}
          onClick={handleSubmit}
        >
          {disabled ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}
