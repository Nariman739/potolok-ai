// Текстуры пола и стен для 3D — ВЕБ-версия платформенного модуля (11.11.2026).
// В приложении (potolok-integration/src/components/room-3d/textures.ts) картинки
// грузятся из бандла через expo-asset по moduleId; здесь — те же jpg из
// public/textures/app/ через THREE.TextureLoader. API одинаковый, чтобы Room3D.tsx
// оставался файлом-близнецом побайтно: FLOOR_TEXTURES / WALL_TEXTURES / useRoomTexture.
// Сам этот файл — не близнец (единственное платформенное место).

import * as THREE from "three";
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<THREE.Texture>>();

/** Загружает jpg/png как текстуру (кэш по URL). */
export function loadWebTexture(url: string): Promise<THREE.Texture> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = 4;
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      (e) => reject(e),
    );
  });
  p.catch(() => cache.delete(url));
  cache.set(url, p);
  return p;
}

/**
 * Текстура с повтором «1 тайл на tileM метров». UV у ShapeGeometry/
 * ExtrudeGeometry — мировые метры, поэтому repeat = 1/tileM одинаков для
 * любой формы комнаты и любой длины стены. Пока грузится — null (материал
 * рисуется однотонным цветом пресета).
 */
export function useRoomTexture(mod: string | undefined, tileM: number): THREE.Texture | null {
  const [tex, setTex] = useState<{ mod: string; tileM: number; t: THREE.Texture } | null>(null);
  useEffect(() => {
    if (mod == null) return;
    let alive = true;
    loadWebTexture(mod)
      .then((base) => {
        if (!alive) return;
        const t = base.clone();
        t.repeat.set(1 / tileM, 1 / tileM);
        t.needsUpdate = true;
        setTex({ mod, tileM, t });
      })
      .catch((e) => {
        console.warn("[3D] texture load error", e);
      });
    return () => {
      alive = false;
    };
  }, [mod, tileM]);
  // Текстура отдаётся только для текущих mod/tileM: пока грузится новая — однотонный цвет.
  return mod != null && tex && tex.mod === mod && tex.tileM === tileM ? tex.t : null;
}

// Те же картинки, что в приложении (assets/textures/*.jpg), скопированы в public/textures/app/.
export const FLOOR_TEXTURES: Record<string, { mod: string; tint: string }> = {
  oak_parquet: { mod: "/textures/app/floor_oak_parquet.jpg", tint: "#E4DED6" },
  light_laminate: { mod: "/textures/app/floor_light_laminate.jpg", tint: "#E2DACE" },
  gray_tile: { mod: "/textures/app/floor_gray_tile.jpg", tint: "#FFFFFF" },
  dark_parquet: { mod: "/textures/app/floor_oak_parquet.jpg", tint: "#7A5E4C" },
};

const WALL_PLASTER = "/textures/app/wall_plaster.jpg";
const WALL_PLASTER_DECO = "/textures/app/wall_plaster_deco.jpg";
const WALL_WALLPAPER = "/textures/app/wall_wallpaper.jpg";
export const WALL_TEXTURES: Record<string, string> = {
  white_paint: WALL_PLASTER,
  light_gray: WALL_PLASTER,
  beige_wallpaper: WALL_WALLPAPER,
  decorative_plaster: WALL_PLASTER_DECO,
};

/** В приложении — проверка одной копии three в бандле; на вебе не нужна. */
export function devCheckThree(): void {}
