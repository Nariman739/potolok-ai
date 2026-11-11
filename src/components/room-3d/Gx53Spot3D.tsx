import * as THREE from "three";
import { useDesignPass } from "./designPassLook";

// Софит GX53 — плоская круглая «таблетка» под лампу GX53, встроенная ЗАПОДЛИЦО
// с полотном (стандарт для натяжных потолков в КЗ). По фото-референсам
// (10.10.2026, refs/matovyi-gx53-gardina-1, glyanec-belyi-gx53-1): белое
// кольцо Ø≈106 мм почти не выступает, внутри большой матовый рассеиватель,
// который ровно светится во весь диаметр; снаружи тонкий светлый ободок.
// Чёрная окантовка и выступ 12 мм (02.07) убраны: на белом полотне кольцо
// белое — так ставят в 9 из 10 квартир.
const GX53_DIAMETER_M = 0.09; // GX53 по фото: видимое кольцо ~90 мм (аудит 02.11)

// Торец кольца одной текстурой: UV ringGeometry — проекция XY в [0..1], радиус
// 0.39…0.5 от центра = r·0.78…r. Наружные ~10 % чуть темнее (0.92: серый ободок
// 0.83 на тёмном полотне показа давал контрастный край с «пилой», кадры 11.11), переход мягкий; мипмапы сглаживают на расстоянии.
let ringFace: THREE.DataTexture | null = null;
function getRingFaceTexture(): THREE.DataTexture {
  if (ringFace) return ringFace;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const rr = Math.hypot(x / (N - 1) - 0.5, y / (N - 1) - 0.5) / 0.5; // 0 центр … 1 край кольца
      const t = Math.min(1, Math.max(0, (rr - 0.86) / 0.08));
      const k = 1 - 0.08 * t * t * (3 - 2 * t);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(255 * k);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  ringFace = t;
  return t;
}

interface Gx53Spot3DProps {
  position: [number, number, number];
  withLight: boolean;
  lightColor?: string;
  diameterMm?: number;
  ringColor?: string;
}

export function Gx53Spot3D({
  position,
  withLight,
  lightColor: lightColorOverride,
  diameterMm,
  ringColor,
}: Gx53Spot3DProps) {
  // Нейтрально-белый рассеиватель (~4000K), НЕ по тёплой температуре сцены
  // (Нариман 02.07: «а то оранжевая»). Спокойный, не слепит.
  void lightColorOverride;
  // Линза — САМОЕ яркое в кадре (аудит 02.11): чистый белый без тонмаппинга.
  // Кольцо белое, ободок светлый (серый читался как выключенная лампа).
  const glow = "#FFFFFF";
  const frame = ringColor ?? "#ECECE9";
  const rim = "#C4C4C0";
  const diameterM = typeof diameterMm === "number" && diameterMm > 0 ? diameterMm / 1000 : GX53_DIAMETER_M;
  const r = diameterM / 2;

  const ringSmooth = useDesignPass("spotRingSmooth");
  const PROTRUDE = 0.004; // кольцо выступает из полотна на 4 мм (заподлицо на вид)

  return (
    <group position={position}>
      {/* Корпус-кольцо: белый цилиндр 4 мм — почти заподлицо */}
      <mesh position={[0, -PROTRUDE / 2, 0]}>
        <cylinderGeometry args={[r, r, PROTRUDE, 40]} />
        <meshStandardMaterial color={frame} roughness={0.45} metalness={0.08} />
      </mesh>
      {/* Нижний торец: тонкий серый ободок снаружи + белое кольцо внутри */}
      {ringSmooth ? (
        // Дизайн-разбор 11.11: одно кольцо, ободок нарисован текстурой с мипмапами —
        // без MSAA тонкое геометрическое кольцо 0,1 r рвётся в «пилу».
        <mesh position={[0, -PROTRUDE - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r * 0.78, r, 64, 1]} />
          <meshStandardMaterial color={frame} map={getRingFaceTexture()} roughness={0.45} metalness={0.08} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, -PROTRUDE - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r * 0.9, r, 48]} />
            <meshStandardMaterial color={rim} roughness={0.4} metalness={0.2} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -PROTRUDE - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r * 0.78, r * 0.9, 48]} />
            <meshStandardMaterial color={frame} roughness={0.45} metalness={0.08} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {/* Матовый рассеиватель — ровно светится во весь внутренний диаметр.
          toneMapped=false: лампа ярче любого белого в сцене. */}
      <mesh position={[0, -PROTRUDE - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 0.78, 48]} />
        <meshBasicMaterial color={glow} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* Пятно света на полотне рисует Scene3DNative (ceilingLightPools), не сам софит. */}
      {void withLight}
    </group>
  );
}
