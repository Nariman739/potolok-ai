"use client";

import { Component, type ReactNode } from "react";

interface Props {
  /** Что показать вместо упавшего поддерева. Для материала — plain material,
      для Environment/GLB — null (сцена продолжает жить на остальном освещении). */
  fallback: ReactNode;
  /** Вызывается один раз при первой ошибке — родитель может пометить ресурс
      как «недоступен» (напр. HDRI не загрузился → отключить envMap-зависимую логику). */
  onError?: (error: Error) => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Локальный error boundary ВНУТРИ Canvas (R3F).
 *
 * Зачем: `<Suspense fallback>` ловит только состояние загрузки, а НЕ ошибку.
 * Когда `useLoader`/`useGLTF`/`<Environment>` не может дотянуть ресурс
 * (флаки-мобильный интернет — мастер делает визуализацию в машине), loader
 * бросает исключение мимо Suspense. Без локального boundary оно всплывает до
 * Scene3DBoundary и убивает ВСЮ сцену — на iOS Safari это и выглядит как
 * «Load failed» / пустой экран.
 *
 * Оборачивая каждый рискованный ресурс отдельно, мы деградируем точечно:
 * нет HDRI → сцена на обычном свете; нет текстуры → plain-цвет; нет GLB →
 * процедурная мебель. Клиент всё равно видит красивую комнату.
 */
export class R3FErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Не шумим в Sentry — это ожидаемая деградация на плохой сети.
    console.warn("[Scene3D] ресурс не загрузился, деградируем:", error.message);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
