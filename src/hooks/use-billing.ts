"use client";

import { useCallback, useEffect, useState } from "react";

export interface BillingInfo {
  allowed: boolean;
  reason: "trial_exhausted_and_monthly_used" | "monthly_limit_reached" | "credits_exhausted" | null;
  bucket: "trial" | "monthly" | "credits";
  remaining: number;
  currentAvailable: number;
  tier: "FREE" | "PRO" | "PROPLUS";
  trialRendersUsed: number;
  trialEndAt: string | null;
  monthlyUsed: number;
  limits: {
    trialLimit: number;
    monthlyByTier: Record<"FREE" | "PRO" | "PROPLUS", number>;
  };
}

interface UseBillingResult {
  billing: BillingInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBilling(): UseBillingResult {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/visualizations/billing", { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setBilling(null);
        return;
      }
      const data: BillingInfo = await res.json();
      setBilling(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBilling(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { billing, loading, error, refresh };
}
