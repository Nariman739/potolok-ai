"use client";

/* eslint-disable react-hooks/immutability --
   Осознанный императивный снимок: Three.js по природе мутабелен. Мы ВРЕМЕННО меняем
   camera/scene для двух проходов рендера (beauty + маска) и СИНХРОННО возвращаем всё
   как было в том же тике, до отдачи управления R3F. Иначе снимок не сделать. */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CEILING_MASK_LAYER, FLOATING_MASK_LAYER } from "./constants";

export interface HeroCam {
  /** Позиция камеры в мировых координатах [x,y,z]. */
  pos: [number, number, number];
  /** Точка, куда смотрит камера [x,y,z]. */
  look: [number, number, number];
  /** Угол обзора (вертикальный FOV, градусы). Шире → потолок и комната крупнее в кадре. */
  fov: number;
}

interface AiSceneCaptureProps {
  trigger: number;
  /** Если задан — на время AI-кадра камера встаёт в «геройский» ракурс (потолок крупно),
   * потом возвращается на пользовательскую камеру. Если null — снимаем как есть. */
  hero: HeroCam | null;
  /** (beauty, ceilingMask, floatingMask) — все PNG одного разрешения (один канвас).
   * floatingMask пуст (чёрный), если парящего в сцене нет. */
  onCapture: (beautyDataUrl: string, ceilingMaskDataUrl: string, floatingMaskDataUrl: string) => void;
}

// Один материал на все проходы — не плодим GC.
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const BLACK_BG = new THREE.Color(0x000000);

/**
 * Захват кадра для AI-визуализации. Делает ДВА снимка с ОДНОЙ (геройской) камеры:
 *   1) beauty — обычный красивый рендер сцены (уходит в AI как основа комнаты).
 *   2) mask   — пиксельно-точный силуэт потолка (белый на чёрном), полученный
 *      отдельным проходом: камера видит только слой CEILING_MASK_LAYER, фон чёрный,
 *      overrideMaterial белый. Никакого AI-угадывания границы — геометрия точная.
 *
 * Обе картинки одного разрешения (один и тот же канвас) → идеально совмещаются
 * при заморозке потолка на сервере (compositeWithMask).
 */
export function AiSceneCapture({ trigger, hero, onCapture }: AiSceneCaptureProps) {
  const { gl, scene, camera } = useThree();
  const last = useRef(0);

  useEffect(() => {
    if (trigger === 0 || trigger === last.current) return;
    last.current = trigger;

    const cam = camera as THREE.PerspectiveCamera;

    // --- сохраняем состояние камеры/сцены/рендерера ---
    const savedPos = cam.position.clone();
    const savedQuat = cam.quaternion.clone();
    const savedFov = cam.fov;
    const savedLayersMask = cam.layers.mask;
    const savedBg = scene.background;
    const savedOverride = scene.overrideMaterial;

    // --- геройский ракурс на время AI-кадра ---
    if (hero) {
      cam.position.set(hero.pos[0], hero.pos[1], hero.pos[2]);
      cam.up.set(0, 1, 0);
      cam.lookAt(hero.look[0], hero.look[1], hero.look[2]);
      cam.fov = hero.fov;
      cam.updateProjectionMatrix();
    }

    // --- 1) BEAUTY: обычный рендер ---
    gl.render(scene, camera);
    const beauty = gl.domElement.toDataURL("image/png");

    // --- 2) CEILING MASK: только слой потолка, белым, на чёрном фоне ---
    scene.background = BLACK_BG;
    scene.overrideMaterial = WHITE_MAT;
    cam.layers.set(CEILING_MASK_LAYER); // камера видит ТОЛЬКО потолок
    gl.render(scene, camera);
    const mask = gl.domElement.toDataURL("image/png");

    // --- 3) FLOATING MASK: только слой свечения парящего (периметр) ---
    cam.layers.set(FLOATING_MASK_LAYER);
    gl.render(scene, camera);
    const floatingMask = gl.domElement.toDataURL("image/png");

    // --- восстанавливаем всё как было ---
    scene.overrideMaterial = savedOverride;
    scene.background = savedBg;
    cam.layers.mask = savedLayersMask;
    cam.position.copy(savedPos);
    cam.quaternion.copy(savedQuat);
    cam.fov = savedFov;
    cam.updateProjectionMatrix();
    gl.render(scene, camera);

    onCapture(beauty, mask, floatingMask);
  }, [trigger, gl, scene, camera, hero, onCapture]);

  return null;
}
