// Сборщик геометрии мебели (06.11.2026): один предмет = одна BufferGeometry
// с цветом в вершинах → один draw call на предмет при любом числе деталей.
// Раньше каждая створка, ручка и секция радиатора были отдельным мешем со
// своим материалом (шкаф — 7 мешей, радиатор — 12), а GLB-модели давали по
// 6–17 тыс. треугольников на предмет.
//
// Чистый three.js без React — геометрию можно посчитать и проверить из node.
// Локальные оси предмета: X — ширина, Y — вверх от пола, Z — глубина,
// +Z — «лицо» (в комнату), −Z — зад (к стене).

import * as THREE from "three";

/** Цвет в линейном пространстве (как ждёт атрибут color). */
export type RGB = readonly [number, number, number];

const colorCache = new Map<string, RGB>();
export function rgb(hex: string): RGB {
  let c = colorCache.get(hex);
  if (!c) {
    const t = new THREE.Color(hex);
    c = [t.r, t.g, t.b];
    colorCache.set(hex, c);
  }
  return c;
}

export function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export type Face = "px" | "nx" | "py" | "ny" | "pz" | "nz";

export interface BoxOpts {
  /** Грани, которые не строить (закрыты соседней деталью или стеной). */
  skip?: Face[];
  /** Свой цвет отдельных граней. */
  faces?: Partial<Record<Face, RGB>>;
  /** Множитель яркости нижних / верхних вершин (вертикальный градиент). */
  bottomK?: number;
  topK?: number;
  /** Поворот вокруг центра детали, радианы (порядок XYZ). */
  rot?: [number, number, number];
}

type V3 = [number, number, number];

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private mat = new THREE.Matrix4();
  private nmat = new THREE.Matrix3();
  private hasMat = false;
  private v = new THREE.Vector3();

  get triangles(): number {
    return this.pos.length / 9;
  }

  private setTransform(cx: number, cy: number, cz: number, rot?: [number, number, number]) {
    if (!rot) {
      this.hasMat = false;
      return;
    }
    this.mat.makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    this.nmat.setFromMatrix4(this.mat);
    // поворот вокруг центра детали: p' = R·(p − c) + c
    const c = new THREE.Vector3(cx, cy, cz);
    const rc = c.clone().applyMatrix4(this.mat);
    this.mat.setPosition(c.sub(rc));
    this.hasMat = true;
  }

  private vert(p: V3, n: V3, c: RGB) {
    if (this.hasMat) {
      this.v.set(p[0], p[1], p[2]).applyMatrix4(this.mat);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.set(n[0], n[1], n[2]).applyMatrix3(this.nmat);
      this.nor.push(this.v.x, this.v.y, this.v.z);
    } else {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
    }
    this.col.push(c[0], c[1], c[2]);
  }

  /** Треугольник; порядок вершин выправляется так, чтобы лицо смотрело по нормалям. */
  private tri(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, ca: RGB, cb: RGB, cc: RGB) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const out = fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2]);
    if (out >= 0) {
      this.vert(a, na, ca); this.vert(b, nb, cb); this.vert(c, nc, cc);
    } else {
      this.vert(a, na, ca); this.vert(c, nc, cc); this.vert(b, nb, cb);
    }
  }

  /** Четырёхугольник по углам в порядке обхода, с нормалью и цветом на каждый угол. */
  quad(p: [V3, V3, V3, V3], n: V3 | [V3, V3, V3, V3], c: RGB | [RGB, RGB, RGB, RGB]) {
    const ns = (Array.isArray(n[0]) ? n : [n, n, n, n]) as [V3, V3, V3, V3];
    const cs = (Array.isArray(c[0]) ? c : [c, c, c, c]) as [RGB, RGB, RGB, RGB];
    this.tri(p[0], p[1], p[2], ns[0], ns[1], ns[2], cs[0], cs[1], cs[2]);
    this.tri(p[0], p[2], p[3], ns[0], ns[2], ns[3], cs[0], cs[2], cs[3]);
  }

  /** Плоский прямоугольник в плоскости XY (лицом к +Z), цвет сверху и снизу — для экрана, фартука. */
  panelZ(cx: number, cy: number, z: number, w: number, h: number, top: RGB, bottom: RGB = top) {
    this.hasMat = false;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    this.quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], [bottom, bottom, top, top]);
  }

  /** Коробка с центром (cx, cy, cz) и размерами w×h×d. */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: RGB, o: BoxOpts = {}) {
    this.setTransform(cx, cy, cz, o.rot);
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const kb = o.bottomK ?? 1, kt = o.topK ?? 1;
    const grad = kb !== 1 || kt !== 1;
    const face = (f: Face, p: [V3, V3, V3, V3], n: V3) => {
      if (o.skip?.includes(f)) return;
      const base = o.faces?.[f] ?? color;
      if (!grad) return this.quad(p, n, base);
      const cs = p.map((q) => shade(base, q[1] === y0 ? kb : kt)) as [RGB, RGB, RGB, RGB];
      this.quad(p, n, cs);
    };
    face("pz", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    face("nz", [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    face("px", [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    face("nx", [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    face("py", [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    face("ny", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    this.hasMat = false;
  }

  /**
   * Коробка со скруглёнными кромками (мягкая мебель, подушки): фаска радиуса r
   * с плавными нормалями — 44 треугольника, на глаз читается как скругление.
   */
  softBox(cx: number, cy: number, cz: number, w: number, h: number, d: number, r: number, color: RGB, o: BoxOpts = {}) {
    this.setTransform(cx, cy, cz, o.rot);
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const rr = Math.min(r, hw * 0.9, hh * 0.9, hd * 0.9);
    const kb = o.bottomK ?? 1, kt = o.topK ?? 1;
    const colAt = (f: Face | null, y: number): RGB => {
      const base = (f && o.faces?.[f]) || color;
      if (kb === 1 && kt === 1) return base;
      const t = (y + hh) / h;
      return shade(base, kb + (kt - kb) * t);
    };
    type PV = { p: V3; n: V3; f: Face };
    const S = [-1, 1] as const;
    const corner = (sx: number, sy: number, sz: number): [PV, PV, PV] => [
      { p: [cx + sx * hw, cy + sy * (hh - rr), cz + sz * (hd - rr)], n: [sx, 0, 0], f: sx > 0 ? "px" : "nx" },
      { p: [cx + sx * (hw - rr), cy + sy * hh, cz + sz * (hd - rr)], n: [0, sy, 0], f: sy > 0 ? "py" : "ny" },
      { p: [cx + sx * (hw - rr), cy + sy * (hh - rr), cz + sz * hd], n: [0, 0, sz], f: sz > 0 ? "pz" : "nz" },
    ];
    const C: Record<string, [PV, PV, PV]> = {};
    for (const sx of S) for (const sy of S) for (const sz of S) C[`${sx}${sy}${sz}`] = corner(sx, sy, sz);
    const get = (sx: number, sy: number, sz: number, axis: 0 | 1 | 2) => C[`${sx}${sy}${sz}`][axis];
    const cOf = (v: PV) => colAt(v.f, v.p[1] - cy);
    const q = (a: PV, b: PV, c: PV, d2: PV) => this.quad([a.p, b.p, c.p, d2.p], [a.n, b.n, c.n, d2.n], [cOf(a), cOf(b), cOf(c), cOf(d2)]);
    const skip = (f: Face) => o.skip?.includes(f);
    // 6 граней
    for (const s of S) {
      if (!skip(s > 0 ? "px" : "nx")) q(get(s, -1, -1, 0), get(s, 1, -1, 0), get(s, 1, 1, 0), get(s, -1, 1, 0));
      if (!skip(s > 0 ? "py" : "ny")) q(get(-1, s, -1, 1), get(1, s, -1, 1), get(1, s, 1, 1), get(-1, s, 1, 1));
      if (!skip(s > 0 ? "pz" : "nz")) q(get(-1, -1, s, 2), get(1, -1, s, 2), get(1, 1, s, 2), get(-1, 1, s, 2));
    }
    // 12 кромок
    for (const a of S) for (const b of S) {
      q(get(a, b, -1, 0), get(a, b, 1, 0), get(a, b, 1, 1), get(a, b, -1, 1)); // вдоль Z между X и Y
      q(get(a, -1, b, 0), get(a, 1, b, 0), get(a, 1, b, 2), get(a, -1, b, 2)); // вдоль Y между X и Z
      q(get(-1, a, b, 1), get(1, a, b, 1), get(1, a, b, 2), get(-1, a, b, 2)); // вдоль X между Y и Z
    }
    // 8 углов
    for (const sx of S) for (const sy of S) for (const sz of S) {
      const [vx, vy, vz] = C[`${sx}${sy}${sz}`];
      this.tri(vx.p, vy.p, vz.p, vx.n, vy.n, vz.n, cOf(vx), cOf(vy), cOf(vz));
    }
    this.hasMat = false;
  }

  /** Цилиндр вдоль оси (трубы подводки, стойки). */
  cyl(cx: number, cy: number, cz: number, radius: number, length: number, color: RGB, axis: "x" | "y" | "z" = "y", segs = 8) {
    this.hasMat = false;
    const at = (a: number, t: number): { p: V3; n: V3 } => {
      const c = Math.cos(a), s = Math.sin(a);
      const l = (t - 0.5) * length;
      if (axis === "y") return { p: [cx + c * radius, cy + l, cz + s * radius], n: [c, 0, s] };
      if (axis === "x") return { p: [cx + l, cy + c * radius, cz + s * radius], n: [0, c, s] };
      return { p: [cx + c * radius, cy + s * radius, cz + l], n: [c, s, 0] };
    };
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p00 = at(a0, 0), p10 = at(a1, 0), p11 = at(a1, 1), p01 = at(a0, 1);
      this.quad([p00.p, p10.p, p11.p, p01.p], [p00.n, p10.n, p11.n, p01.n], color);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Мягкая тень-прямоугольник в плоскости XY: внутри w×h плотная, наружу тает
 * полосой ФИКСИРОВАННОЙ ширины band (в метрах). Девять клеток с UV под
 * текстуру getSoftRectTexture (переход у неё занимает 22 % с каждого края):
 * полоса band всегда ложится на этот переход, середина — на плотный центр.
 * Раньше ту же текстуру тянули на всю плоскость, и тень таяла на 22 % размера
 * предмета: под крупной мебелью (диван, кровать, кухня) её почти не было видно.
 * (Альфа в цвете вершин без текстуры на expo-gl не заработала — меш не рисовался.)
 */
export function softShadowGeometry(w: number, h: number, band: number): THREE.BufferGeometry {
  const T = 0.22; // доля перехода в текстуре
  const x = [-w / 2 - band, -w / 2, w / 2, w / 2 + band];
  const y = [-h / 2 - band, -h / 2, h / 2, h / 2 + band];
  const t = [0, T, 1 - T, 1];
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const q: Array<[number, number]> = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]];
      for (const [ii, jj] of q) {
        pos.push(x[ii], y[jj], 0);
        uv.push(t[ii], t[jj]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
