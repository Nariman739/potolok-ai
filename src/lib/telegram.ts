// Telegram Bot API utilities for PotolokAI
// Requires: TELEGRAM_BOT_TOKEN env var

function getToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "missing";
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${getToken()}/${method}`;
}

// ─────────────────────────────────────────────────────
// Send text message (HTML)
// ─────────────────────────────────────────────────────
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;

  try {
    // Telegram limit: 4096 chars per message
    if (text.length <= 4096) {
      await fetch(apiUrl("sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      });
    } else {
      // Split into chunks
      const chunks = splitText(text, 4096);
      for (const chunk of chunks) {
        await fetch(apiUrl("sendMessage"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: "HTML",
          }),
        });
      }
    }
  } catch {
    console.error("Telegram notification failed (non-critical)");
  }
}

// ─────────────────────────────────────────────────────
// Send "typing..." indicator
// ─────────────────────────────────────────────────────
export async function sendTypingAction(chatId: string): Promise<void> {
  try {
    await fetch(apiUrl("sendChatAction"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch {
    // non-critical
  }
}

// ─────────────────────────────────────────────────────
// Get file download URL from Telegram
// ─────────────────────────────────────────────────────
export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(apiUrl("getFile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${getToken()}/${data.result.file_path}`;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────
// Download file as Buffer
// ─────────────────────────────────────────────────────
export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const url = await getTelegramFileUrl(fileId);
  if (!url) return null;
  try {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────
// Send document (PDF, etc.)
// ─────────────────────────────────────────────────────
export async function sendTelegramDocument(
  chatId: string,
  fileBuffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("document", new Blob([new Uint8Array(fileBuffer)]), filename);
    if (caption) formData.append("caption", caption);

    await fetch(apiUrl("sendDocument"), {
      method: "POST",
      body: formData,
    });
  } catch {
    console.error("Telegram sendDocument failed");
  }
}

// ─────────────────────────────────────────────────────
// Send photo
// ─────────────────────────────────────────────────────
export async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption?: string
): Promise<void> {
  try {
    await fetch(apiUrl("sendPhoto"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    });
  } catch {
    console.error("Telegram sendPhoto failed");
  }
}

// ─────────────────────────────────────────────────────
// Helper: split long text
// ─────────────────────────────────────────────────────
function splitText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at newline
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}
