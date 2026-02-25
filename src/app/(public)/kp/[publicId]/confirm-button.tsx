"use client";

import { useState } from "react";

interface ConfirmButtonProps {
  estimateId: string;
  initialConfirmed: boolean;
}

export function ConfirmButton({ estimateId, initialConfirmed }: ConfirmButtonProps) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (confirmed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/confirm`, {
        method: "POST",
      });
      if (res.ok) {
        setConfirmed(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 rounded-xl bg-gray-100 text-gray-400 px-6 py-3 text-sm font-medium cursor-not-allowed border border-gray-200"
      >
        ✅ Принято
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl bg-green-600 text-white px-6 py-3 text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? "Подождите..." : "✅ Принять предложение"}
    </button>
  );
}
