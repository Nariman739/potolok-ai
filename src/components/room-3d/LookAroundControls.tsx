"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface LookAroundHandle {
  setView(position: THREE.Vector3, lookAt: THREE.Vector3): void;
}

interface Props {
  sensitivity?: number;
}

const PITCH_LIMIT = Math.PI / 2 - 0.05;

export const LookAroundControls = forwardRef<LookAroundHandle, Props>(function LookAroundControls(
  { sensitivity = 0.005 },
  ref,
) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const targetYaw = useRef(0);
  const targetPitch = useRef(0);
  const targetPos = useRef(new THREE.Vector3());
  const isDragging = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  useImperativeHandle(ref, () => ({
    setView(position, lookAt) {
      targetPos.current.copy(position);
      const dx = lookAt.x - position.x;
      const dy = lookAt.y - position.y;
      const dz = lookAt.z - position.z;
      targetYaw.current = Math.atan2(-dx, -dz);
      const horiz = Math.hypot(dx, dz);
      targetPitch.current = Math.atan2(dy, horiz);
      targetPitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, targetPitch.current));
    },
  }), []);

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch {}
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastX.current;
      const dy = e.clientY - lastY.current;
      lastX.current = e.clientX;
      lastY.current = e.clientY;
      targetYaw.current -= dx * sensitivity;
      targetPitch.current -= dy * sensitivity;
      targetPitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, targetPitch.current));
    };
    const onPointerUp = (e: PointerEvent) => {
      isDragging.current = false;
      try { dom.releasePointerCapture(e.pointerId); } catch {}
    };

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("pointerleave", onPointerUp);

    return () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("pointerleave", onPointerUp);
    };
  }, [gl, sensitivity]);

  useFrame(() => {
    yaw.current = THREE.MathUtils.lerp(yaw.current, targetYaw.current, 0.18);
    pitch.current = THREE.MathUtils.lerp(pitch.current, targetPitch.current, 0.18);
    camera.position.lerp(targetPos.current, 0.18);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
  });

  return null;
});
