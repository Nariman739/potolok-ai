"use client";

import { useState } from "react";
import type { KpConfig } from "@/lib/kp/types";
import { BrandingEditor } from "./BrandingEditor";
import { OnboardingWizard } from "./OnboardingWizard";
import type { InitialMaster } from "./types";

// Решает что показать: онбординг или сразу редактор.
// После завершения онбординга мы получаем готовый KpConfig от AI и
// переходим в редактор без перезагрузки страницы.
export function BrandingClient({
  hasBrief,
  initialMaster,
  initialConfig,
  initialRationale,
}: {
  hasBrief: boolean;
  initialMaster: InitialMaster;
  initialConfig: KpConfig;
  initialRationale: string | null;
}) {
  const [config, setConfig] = useState<KpConfig>(initialConfig);
  const [master, setMaster] = useState<InitialMaster>(initialMaster);
  const [rationale, setRationale] = useState<string | null>(initialRationale);
  const [showWizard, setShowWizard] = useState<boolean>(!hasBrief);

  if (showWizard) {
    return (
      <OnboardingWizard
        master={master}
        onDone={(result) => {
          setConfig(result.config);
          if (result.tagline) {
            setMaster((m) => ({ ...m, tagline: result.tagline }));
          }
          setRationale(result.rationale);
          setShowWizard(false);
        }}
        onSkip={() => setShowWizard(false)}
      />
    );
  }

  return (
    <BrandingEditor
      master={master}
      onMasterChange={setMaster}
      config={config}
      onConfigChange={setConfig}
      rationale={rationale}
      onReopenWizard={() => setShowWizard(true)}
    />
  );
}
