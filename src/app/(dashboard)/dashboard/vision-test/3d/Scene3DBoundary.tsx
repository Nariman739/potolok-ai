"use client";

import { Component, type ReactNode } from "react";

interface State { error: Error | null }

export class Scene3DBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("[Scene3D] error:", error);
    if (info.componentStack) console.error("[Scene3D] stack:", info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-start justify-center p-4 bg-red-50 overflow-auto">
          <div className="bg-white rounded-xl border border-red-200 shadow p-4 max-w-2xl w-full text-xs">
            <div className="font-bold text-red-700 mb-2">3D-ошибка</div>
            <div className="text-red-900 font-mono break-words mb-2">{this.state.error.message}</div>
            <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded max-h-72 overflow-auto">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium"
            >
              Сбросить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
