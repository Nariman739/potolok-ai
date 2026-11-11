import * as THREE from "three";

// Софит GX53 — плоская круглая «таблетка» под лампу GX53, встроенная ЗАПОДЛИЦО
// с полотном (стандарт для натяжных потолков в КЗ). По фото-референсам
// (10.10.2026, refs/matovyi-gx53-gardina-1, glyanec-belyi-gx53-1): белое
// кольцо Ø≈106 мм почти не выступает, внутри большой матовый рассеиватель,
// который ровно светится во весь диаметр; снаружи тонкий светлый ободок.
// Чёрная окантовка и выступ 12 мм (02.07) убраны: на белом полотне кольцо
// белое — так ставят в 9 из 10 квартир.
const GX53_DIAMETER_M = 0.09; // GX53 по фото: видимое кольцо ~90 мм (аудит 02.11)

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

  const PROTRUDE = 0.004; // кольцо выступает из полотна на 4 мм (заподлицо на вид)

  return (
    <group position={position}>
      {/* Корпус-кольцо: белый цилиндр 4 мм — почти заподлицо */}
      <mesh position={[0, -PROTRUDE / 2, 0]}>
        <cylinderGeometry args={[r, r, PROTRUDE, 40]} />
        <meshStandardMaterial color={frame} roughness={0.45} metalness={0.08} />
      </mesh>
      {/* Нижний торец: тонкий серый ободок снаружи + белое кольцо внутри */}
      <mesh position={[0, -PROTRUDE - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.9, r, 48]} />
        <meshStandardMaterial color={rim} roughness={0.4} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -PROTRUDE - 0.0005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.78, r * 0.9, 48]} />
        <meshStandardMaterial color={frame} roughness={0.45} metalness={0.08} side={THREE.DoubleSide} />
      </mesh>
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
