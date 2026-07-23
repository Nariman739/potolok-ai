"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Статический PNG-снимок 3D (если есть) — показываем клиенту вместо пустого
      экрана, когда сцена совсем не поднялась. Обычно estimate.room3dPreviewUrl. */
  fallbackImageUrl?: string | null;
}

interface State {
  error: Error | null;
  /** Меняем ключ на «Повторить» → дочернее дерево (Scene3D) монтируется заново
      и загрузчики ре-фетчат ресурсы (флаки-сеть в машине — целевой кейс). */
  resetKey: number;
}

/**
 * Внешний boundary вокруг всей 3D-сцены. Ловит то, что не удержали локальные
 * R3FErrorBoundary внутри Canvas (напр. падение WebGL-контекста целиком).
 * Клиенту показываем аккуратный экран с «Повторить», а не сырой стек.
 */
export class Scene3DBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[Scene3D] error:", error);
    if (info.componentStack) console.error("[Scene3D] stack:", info.componentStack);
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-b from-sky-50 to-slate-100">
          <div className="max-w-sm w-full text-center">
            {this.props.fallbackImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={this.props.fallbackImageUrl}
                alt="Превью потолка"
                className="w-full rounded-2xl shadow-lg mb-4 object-cover"
              />
            )}
            <div className="text-2xl mb-2">🖼️</div>
            <div className="text-sm font-bold text-gray-800 mb-1">
              3D не загрузилось
            </div>
            <div className="text-xs text-gray-500 mb-4">
              Проверьте интернет и попробуйте ещё раз — на слабой сети сцена может
              не догрузиться.
            </div>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-semibold active:scale-95"
            >
              Повторить
            </button>
          </div>
        </div>
      );
    }
    // key форсит полный ремаунт поддерева на «Повторить».
    return <div key={this.state.resetKey} className="contents">{this.props.children}</div>;
  }
}
