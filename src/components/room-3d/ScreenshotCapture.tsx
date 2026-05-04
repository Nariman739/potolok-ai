"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

interface ScreenshotCaptureProps {
  trigger: number;
  onCapture: (dataUrl: string) => void;
}

export function ScreenshotCapture({ trigger, onCapture }: ScreenshotCaptureProps) {
  const { gl, scene, camera } = useThree();
  const lastTrigger = useRef(0);

  useEffect(() => {
    if (trigger === 0 || trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;
    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");
    onCapture(dataUrl);
  }, [trigger, gl, scene, camera, onCapture]);

  return null;
}
