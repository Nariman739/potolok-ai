// Регистрация шрифтов для @react-pdf/renderer.
// Файлы лежат в public/fonts/. @react-pdf на сервере принимает абсолютный
// file-path как строку (не Buffer) — это и есть самый надёжный путь.

import { Font } from "@react-pdf/renderer";
import path from "node:path";

let registered = false;

function ttf(name: string): string {
  return path.join(process.cwd(), "public", "fonts", `${name}.ttf`);
}

export function ensureFontsRegistered() {
  if (registered) return;

  Font.register({
    family: "Inter",
    fonts: [
      { src: ttf("Inter-400"), fontWeight: 400 },
      { src: ttf("Inter-600"), fontWeight: 600 },
      { src: ttf("Inter-800"), fontWeight: 800 },
    ],
  });

  Font.register({
    family: "Playfair Display",
    fonts: [
      { src: ttf("PlayfairDisplay-400"), fontWeight: 400 },
      { src: ttf("PlayfairDisplay-700"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Lora",
    fonts: [
      { src: ttf("Lora-400"), fontWeight: 400 },
      { src: ttf("Lora-700"), fontWeight: 700 },
    ],
  });

  Font.register({
    family: "Manrope",
    fonts: [
      { src: ttf("Manrope-400"), fontWeight: 400 },
      { src: ttf("Manrope-800"), fontWeight: 800 },
    ],
  });

  Font.register({
    family: "Cormorant Garamond",
    fonts: [
      { src: ttf("CormorantGaramond-400"), fontWeight: 400 },
      { src: ttf("CormorantGaramond-700"), fontWeight: 700 },
    ],
  });

  // По умолчанию @react-pdf вставляет переносы дефисом — для русского некрасиво.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
