// 3D-сцена атласа: типодонт (две челюсти) и конструкции, собранные в коде.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (p, a, b) => ease(clamp01((p - a) / (b - a)));

// Размеры зубов от центра к краю дуги: центральный и боковой резцы, клык, премоляры, моляры (условные мм).
const SPEC = {
  upper: { w: [8.6, 6.6, 7.6, 7, 6.6, 10.2, 9.2], h: [10.5, 9, 10.2, 8.2, 7.6, 7, 6.6], d: [7.2, 6.4, 8, 9, 9, 11, 10.5] },
  lower: { w: [5.4, 5.9, 6.9, 7, 7.1, 11, 10.4], h: [9, 9.2, 10.4, 8.4, 7.8, 7.2, 6.8], d: [6.2, 6.4, 7.6, 7.8, 8.3, 10.5, 10] },
};
const TYPES = ['ci', 'li', 'c', 'p1', 'p2', 'm1', 'm2'];
const ARCH = [[-24.5, -24], [-23, -10], [-18.5, 4], [-10.5, 14.5], [0, 18], [10.5, 14.5], [18.5, 4], [23, -10], [24.5, -24]];

// ---------- материалы ----------
const M = {
  tooth: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
  gum: new THREE.MeshPhysicalMaterial({ color: '#d9848f', roughness: 0.42, clearcoat: 0.35, sheen: 0.6, sheenColor: '#ffc2c8', transparent: true }),
  bone: new THREE.MeshStandardMaterial({ color: '#efe4cf', roughness: 0.8, transparent: true, opacity: 0, depthWrite: false }),
  metal: new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 1, roughness: 0.22 }),
  titanium: new THREE.MeshStandardMaterial({ color: '#aab3c2', metalness: 1, roughness: 0.32 }),
  abutment: new THREE.MeshStandardMaterial({ color: '#d7c38e', metalness: 1, roughness: 0.28 }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: '#f1ece2', roughness: 0.38, clearcoat: 0.5 }),
  whiteWire: new THREE.MeshStandardMaterial({ color: '#f2f1ee', roughness: 0.35, metalness: 0.2 }),
  sapphire: new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: 1.2, roughness: 0.04, ior: 1.77, clearcoat: 1 }),
  clearTie: new THREE.MeshPhysicalMaterial({ color: '#f5f8ff', transmission: 0.9, thickness: 0.5, roughness: 0.15 }),
  lilacTie: new THREE.MeshPhysicalMaterial({ color: '#2b8fd0', roughness: 0.35, clearcoat: 0.6 }),
  aligner: new THREE.MeshPhysicalMaterial({ color: '#c9dcff', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, depthWrite: false }),
  toothDull: new THREE.MeshPhysicalMaterial({ vertexColors: true, color: '#d6c6a0', roughness: 0.5 }),
  composite: new THREE.MeshPhysicalMaterial({ color: '#f3efe3', roughness: 0.3, clearcoat: 0.6 }),
  stump: new THREE.MeshStandardMaterial({ color: '#dcc49a', roughness: 0.6 }),
  zirconia: new THREE.MeshPhysicalMaterial({ color: '#fbfbf8', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, emissive: '#2b8fd0', emissiveIntensity: 0 }),
  veneer: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.08, clearcoat: 1, transmission: 0.1, thickness: 0.4, transparent: true, emissive: '#2b8fd0', emissiveIntensity: 0 }),
  acrylic: new THREE.MeshPhysicalMaterial({ color: '#e27c8e', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true }),
};
const FADE = [M.aligner, M.zirconia, M.veneer, M.acrylic]; // материалы, которые проявляются при сборке
const glow = (k) => (M.zirconia.emissiveIntensity = M.veneer.emissiveIntensity = lerp(0.55, 0.12, k));

// ---------- геометрия зуба ----------
function toothGeo(type, w, h, d) {
  let g = new THREE.SphereGeometry(1, 48, 36);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const cusps = type[0] === 'm' ? [[0.45, 0.42], [-0.45, 0.42], [0.45, -0.42], [-0.45, -0.42]] : type[0] === 'p' ? [[0, 0.48], [0, -0.48]] : [];
  const cRoot = new THREE.Color('#d9c193'), cBody = new THREE.Color('#e9dcc0'), cEdge = new THREE.Color('#e3ebf0');
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let X = Math.sign(x) * Math.abs(x) ** 0.6;
    let Y = Math.sign(y) * Math.abs(y) ** 0.75;
    let Z = Math.sign(z) * Math.abs(z) ** 0.6;
    const t = (Y + 1) / 2; // 0 — шейка, 1 — режущий край
    if (type === 'ci' || type === 'li') { X *= lerp(0.72, 1.04, smooth(t)); Z *= lerp(1, 0.26, t ** 1.3); Z -= 0.12 * t; }
    else if (type === 'c') { X *= lerp(0.78, 1, t) * (1 - 0.62 * Math.max(0, (t - 0.5) / 0.5) ** 1.6); Z *= lerp(1, 0.5, t ** 1.5); Z -= 0.08 * t; }
    else { X *= lerp(0.84, 1, smooth(t)); Z *= lerp(0.88, 1, smooth(t)); }
    if (cusps.length && t > 0.55) {
      let f = 0;
      for (const [cx, cz] of cusps) f += Math.exp(-((X - cx) ** 2 + (Z - cz) ** 2) / 0.09);
      Y += smooth((t - 0.55) / 0.45) * (0.22 * Math.min(f, 1) - 0.14);
    }
    p.setXYZ(i, (X * w) / 2, ((Y + 1) / 2) * h - 0.12 * h, (Z * d) / 2);
    const c = cRoot.clone().lerp(cBody, smooth(clamp01(t * 1.7)));
    if (type === 'ci' || type === 'li') c.lerp(cEdge, smooth(clamp01((t - 0.78) / 0.22)) * 0.7);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Тонкая накладка-винир из геометрии зуба: передняя половина чуть больше зуба, задняя прижата.
function veneerGeo(src, h) {
  const g = src.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = Math.max(p.getY(i), 0.06 * h), z = p.getZ(i);
    if (z > 0) { x *= 1.035; z = z * 1.05 + 0.12; } else { x *= 0.98; z = z * 0.12 + 0.12; }
    p.setXYZ(i, x, y + 0.05, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- челюсть ----------
function buildJaw(kind) {
  const sc = kind === 'upper' ? 1 : 0.9, dz = kind === 'upper' ? 0 : -2.2;
  const curve = new THREE.CatmullRomCurve3(ARCH.map(([x, z]) => V(x * sc, 0, z * sc + dz)), false, 'centripetal');
  const L = curve.getLength();
  const s = SPEC[kind], gap = 0.25;
  const k = (L * 0.47) / (s.w.reduce((a, b) => a + b, 0) + gap * 7);
  const jaw = { kind, group: new THREE.Group(), extras: new THREE.Group(), teeth: [], curve };
  jaw.group.add(jaw.extras);
  const geos = TYPES.map((t, i) => toothGeo(t, s.w[i] * k, s.h[i], s.d[i]));
  const up = V(0, 1, 0);
  for (const side of [-1, 1]) {
    let acc = 0;
    TYPES.forEach((type, i) => {
      const w = s.w[i] * k, c = acc + w / 2;
      acc += w + gap * k;
      const u = 0.5 + (side * c) / L;
      const pos = curve.getPointAt(u), tan = curve.getTangentAt(u);
      const out = new THREE.Vector3().crossVectors(tan, up).normalize();
      const m = new THREE.Matrix4().makeBasis(tan, up, out);
      const mesh = new THREE.Mesh(geos[i], M.tooth);
      mesh.position.copy(pos);
      mesh.quaternion.setFromRotationMatrix(m);
      if (i <= 2) mesh.rotateX(kind === 'upper' ? 0.1 : 0.05); // коронки передних зубов наклонены вперёд
      mesh.updateMatrix();
      jaw.group.add(mesh);
      jaw.teeth.push({ mesh, type, i, side, u, w, h: s.h[i], d: s.d[i], jaw });
    });
  }
  jaw.teeth.sort((a, b) => a.u - b.u);
  // десна и кость — трубы вдоль дуги, сплюснутые по вертикали
  const tube = (r, mat, sy, y) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 220, r, 28, false), mat));
    for (const u of [0, 1]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat); cap.position.copy(curve.getPointAt(u)); g.add(cap); }
    g.scale.y = sy; g.position.y = y;
    jaw.group.add(g);
    return g;
  };
  jaw.gum = tube(6.4, M.gum, 0.42, -1.6);
  jaw.bone = tube(5.6, M.bone, 1.3, -9);
  jaw.bone.renderOrder = -1;
  return jaw;
}

// ---------- помощники для конструкций ----------
const rc = new THREE.Raycaster();
const probe = new THREE.Mesh();
// Точка на поверхности зуба (side +1 — вестибулярная, −1 — язычная) в координатах челюсти.
function surface(tooth, yFrac, side = 1) {
  probe.geometry = tooth.mesh.geometry;
  rc.set(V(0, tooth.h * yFrac, side * 50), V(0, 0, -side));
  const hit = rc.intersectObject(probe)[0];
  return { p: hit.point.applyMatrix4(tooth.mesh.matrix), n: hit.face.normal.clone().transformDirection(tooth.mesh.matrix) };
}
function place(obj, p, n) {
  const x = new THREE.Vector3().crossVectors(V(0, 1, 0), n).normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  obj.position.copy(p);
  return obj;
}
const twin = (tooth, mat) => {
  const m = new THREE.Mesh(tooth.mesh.geometry, mat);
  m.position.copy(tooth.mesh.position); m.quaternion.copy(tooth.mesh.quaternion);
  return m;
};
function wire(points, r, mat) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 260, r, 10, false), mat);
}

const G = {
  bracket: mergeGeometries([
    Object.assign(new RoundedBoxGeometry(3, 2.8, 0.36, 2, 0.12)).translate(0, 0, 0.18),
    new RoundedBoxGeometry(2.1, 2.3, 0.9, 2, 0.2).translate(0, 0, 0.75),
    new RoundedBoxGeometry(3, 0.75, 0.6, 2, 0.2).translate(0, 1.05, 1.05),
    new RoundedBoxGeometry(3, 0.75, 0.6, 2, 0.2).translate(0, -1.05, 1.05),
  ]),
  tube: mergeGeometries([
    new RoundedBoxGeometry(3.6, 2.6, 0.36, 2, 0.12).translate(0, 0, 0.18),
    new RoundedBoxGeometry(3.8, 1.5, 1.3, 2, 0.4).translate(0, 0, 0.95),
  ]),
  tie: new THREE.TorusGeometry(1.15, 0.26, 10, 32).translate(0, 0, 0.95),
  dot: new THREE.SphereGeometry(0.95, 20, 14).scale(1, 0.8, 0.45),
};

function screwGeo() {
  const pts = [V(0, -0.5), V(2.1, -0.5), V(2.1, -1.4)];
  let y = -1.4, k = 0;
  while (y > -11) { y -= 0.35; const taper = lerp(1, 0.72, clamp01((-y - 8) / 3)); pts.push(V((k++ % 2 ? 2.15 : 1.62) * taper, y)); }
  pts.push(V(1.0, -11.9), V(0, -12.2));
  return new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x, v.y)), 48);
}
function abutGeo(top = 3.2) {
  return new THREE.LatheGeometry([new THREE.Vector2(0, -0.6), new THREE.Vector2(1.8, -0.6), new THREE.Vector2(1.9, 0.2), new THREE.Vector2(1.25, top), new THREE.Vector2(0, top + 0.2)], 40);
}
G.screw = screwGeo();
G.abut = abutGeo();
G.mu = abutGeo(1.4);

// ---------- режимы (что показываем для каждой услуги) ----------
// Каждый режим наполняет jaw.extras и возвращает update(p), p ∈ [0..1] — ход анимации сборки.
function bracesMode(S, kind) {
  const look = {
    metal: [M.metal, M.metal, M.lilacTie],
    ceramic: [M.ceramic, M.whiteWire, M.clearTie],
    sapphire: [M.sapphire, M.metal, M.clearTie],
    lingual: [M.metal, M.metal, null],
  }[kind];
  const face = kind === 'lingual' ? -1 : 1;
  const parts = [];
  for (const jaw of [S.upper, S.lower]) {
    const pts = [];
    for (const t of jaw.teeth) {
      if (t.i > 5) continue;
      const { p, n } = surface(t, t.i === 5 ? 0.42 : 0.48, face);
      const sc = jaw.kind === 'lower' && t.i < 2 ? 0.82 : 1;
      const b = place(new THREE.Mesh(t.i === 5 ? G.tube : G.bracket, look[0]), p, n);
      b.scale.setScalar(sc);
      jaw.extras.add(b);
      parts.push({ obj: b, base: b.position.clone(), n, delay: Math.abs(t.u - 0.5) });
      if (look[2] && t.i < 5) { const tie = place(new THREE.Mesh(G.tie, look[2]), p, n); tie.scale.setScalar(sc); jaw.extras.add(tie); parts.push({ obj: tie, base: tie.position.clone(), n, delay: Math.abs(t.u - 0.5) }); }
      pts.push(p.clone().addScaledVector(n, 1.0 * sc));
    }
    const w = wire(pts, 0.2, look[1]);
    jaw.extras.add(w);
    parts.push({ obj: w, wire: true });
  }
  return (p) => {
    for (const q of parts) {
      if (q.wire) { q.obj.visible = p > 0.62; q.obj.scale.setScalar(1); continue; }
      const k = seg(p, q.delay * 0.9, q.delay * 0.9 + 0.35);
      q.obj.position.copy(q.base).addScaledVector(q.n, (1 - k) * 9);
      q.obj.visible = k > 0.01;
    }
  };
}

function alignerMode(S) {
  const grp = [];
  for (const jaw of [S.upper, S.lower]) {
    const g = new THREE.Group();
    for (const t of jaw.teeth) { const m = twin(t, M.aligner); m.scale.set(1.09, 1.05, 1.15); m.position.y += 0.1; m.renderOrder = 2; g.add(m); }
    jaw.extras.add(g);
    grp.push(g);
  }
  return (p) => { const k = seg(p, 0.05, 0.95); grp.forEach((g) => (g.position.y = (1 - k) * 13)); M.aligner.opacity = lerp(0.05, 0.5, k); };
}

function retainerMode(S) {
  const jaw = S.lower, pts = [], dots = [];
  for (const t of jaw.teeth.filter((t) => t.i <= 2)) {
    const { p, n } = surface(t, 0.32, -1);
    const d = place(new THREE.Mesh(G.dot, M.composite), p, n);
    jaw.extras.add(d); dots.push(d);
    pts.push(p.clone().addScaledVector(n, 0.42));
  }
  const w = wire(pts, 0.28, M.metal);
  jaw.extras.add(w);
  return (p) => { w.visible = p > 0.2; w.scale.setScalar(1); dots.forEach((d, i) => (d.visible = p > 0.35 + i * 0.08)); };
}

function crownMode(S) {
  const t = S.lower.teeth.find((t) => t.side === 1 && t.i === 5);
  t.mesh.visible = false;
  const st = twin(t, M.stump); st.scale.set(0.66, 0.74, 0.64);
  const cr = twin(t, M.zirconia);
  S.lower.extras.add(st, cr);
  const y0 = cr.position.y;
  return (p) => { const k = seg(p, 0.25, 1); cr.position.y = y0 + (1 - k) * 12; M.zirconia.opacity = lerp(0.15, 1, k); glow(k); };
}

function veneerMode(S) {
  const vs = [];
  for (const t of S.upper.teeth.filter((t) => t.i <= 2)) {
    t.mesh.material = M.toothDull; // «до»: потемневшая эмаль под винирами
    const v = new THREE.Mesh(veneerGeo(t.mesh.geometry, t.h), M.veneer);
    v.position.copy(t.mesh.position); v.quaternion.copy(t.mesh.quaternion);
    S.upper.extras.add(v);
    vs.push({ v, base: v.position.clone(), out: V(0, 0, 1).applyQuaternion(v.quaternion), delay: Math.abs(t.u - 0.5) * 1.6 });
  }
  return (p) => { for (const q of vs) { const k = seg(p, q.delay, q.delay + 0.55); q.v.position.copy(q.base).addScaledVector(q.out, (1 - k) * 10); } M.veneer.opacity = lerp(0.1, 1, seg(p, 0, 0.7)); glow(seg(p, 0.3, 1)); };
}

function bridgeMode(S) {
  const by = (i) => S.lower.teeth.find((t) => t.side === 1 && t.i === i);
  const [a, pon, b] = [by(3), by(4), by(5)];
  [a, pon, b].forEach((t) => (t.mesh.visible = false));
  for (const t of [a, b]) { const st = twin(t, M.stump); st.scale.set(0.66, 0.74, 0.64); S.lower.extras.add(st); }
  const g = new THREE.Group();
  for (const t of [a, pon, b]) g.add(twin(t, M.zirconia));
  g.children[1].position.y += 0.9; // промежуточная часть лежит на десне, а не в ней
  for (const [s, e] of [[a, pon], [pon, b]]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(3, 3.2, 4.2, 2, 0.9), M.zirconia);
    c.position.copy(s.mesh.position).lerp(e.mesh.position, 0.5); c.position.y += 3.6; c.quaternion.copy(s.mesh.quaternion);
    g.add(c);
  }
  S.lower.extras.add(g);
  return (p) => { const k = seg(p, 0.25, 1); g.position.y = (1 - k) * 12; M.zirconia.opacity = lerp(0.15, 1, k); glow(k); };
}

function dentureMode(S) {
  const jaw = S.upper;
  jaw.teeth.forEach((t) => (t.mesh.visible = false));
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.TubeGeometry(jaw.curve, 220, 7, 28, false), M.acrylic);
  base.scale.y = 0.5; base.position.y = -0.4;
  const shape = new THREE.Shape(jaw.curve.getSpacedPoints(80).map((v) => new THREE.Vector2(v.x * 0.97, v.z)));
  const palate = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false }).rotateX(Math.PI / 2), M.acrylic);
  palate.position.y = 2.4;
  g.add(base, palate);
  for (const t of jaw.teeth) { const m = twin(t, M.zirconia); m.position.y += 0.6; g.add(m); }
  jaw.extras.add(g);
  return (p) => { const k = seg(p, 0.2, 1); g.position.y = (1 - k) * 15; M.acrylic.opacity = M.zirconia.opacity = lerp(0.15, 1, k); glow(k); };
}

function implantAt(jaw, t, tilt = 0, abut = G.abut) {
  const g = new THREE.Group();
  g.position.copy(t.mesh.position); g.quaternion.copy(t.mesh.quaternion); g.rotateZ(tilt);
  const screw = new THREE.Mesh(G.screw, M.titanium), ab = new THREE.Mesh(abut, M.abutment);
  g.add(screw, ab);
  jaw.extras.add(g);
  return { screw, ab };
}

function implantMode(S) {
  const t = S.lower.teeth.find((t) => t.side === 1 && t.i === 5);
  t.mesh.visible = false;
  const { screw, ab } = implantAt(S.lower, t);
  const cr = twin(t, M.zirconia);
  S.lower.extras.add(cr);
  const y0 = cr.position.y;
  return (p) => {
    const a = seg(p, 0, 0.45), b = seg(p, 0.4, 0.7), c = seg(p, 0.6, 1);
    screw.position.y = (1 - a) * 16; screw.rotation.y = (1 - a) * 14;
    ab.position.y = (1 - b) * 12; ab.visible = b > 0.01;
    cr.position.y = y0 + (1 - c) * 12; cr.visible = c > 0.01;
    M.zirconia.opacity = lerp(0.15, 1, c); glow(c);
  };
}

function allOn4Mode(S) {
  const jaw = S.lower;
  jaw.teeth.forEach((t) => (t.mesh.visible = false));
  const imps = jaw.teeth.filter((t) => t.i === 1 || t.i === 4).map((t) => implantAt(jaw, t, t.i === 4 ? -t.side * 0.52 : 0, G.mu));
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.TubeGeometry(jaw.curve, 220, 6.6, 28, false), M.acrylic);
  base.scale.y = 0.48; base.position.y = 1.2;
  g.add(base);
  for (const t of jaw.teeth.filter((t) => t.i <= 5)) { const m = twin(t, M.zirconia); m.position.y += 1.6; g.add(m); }
  jaw.extras.add(g);
  return (p) => {
    imps.forEach(({ screw, ab }, i) => { const a = seg(p, i * 0.07, i * 0.07 + 0.4); screw.position.y = (1 - a) * 16; screw.rotation.y = (1 - a) * 12; ab.visible = p > 0.5; });
    const c = seg(p, 0.55, 1);
    g.position.y = (1 - c) * 14; g.visible = c > 0.01;
    M.acrylic.opacity = M.zirconia.opacity = lerp(0.15, 1, c); glow(c);
  };
}

const MODES = {
  metal: (S) => bracesMode(S, 'metal'),
  ceramic: (S) => bracesMode(S, 'ceramic'),
  sapphire: (S) => bracesMode(S, 'sapphire'),
  lingual: (S) => bracesMode(S, 'lingual'),
  aligner: alignerMode,
  retainer: retainerMode,
  crown: crownMode,
  veneer: veneerMode,
  bridge: bridgeMode,
  denture: dentureMode,
  implant: implantMode,
  allon4: allOn4Mode,
};

// Ракурсы камеры: позиция, точка взгляда.
const CAMS = {
  front: [V(0, 4, 92), V(0, 0, 2)],
  top: [V(0, 64, 20), V(0, -4, -2)],
  right: [V(44, 40, 52), V(9, -3, 0)],
  rightLow: [V(40, 20, 54), V(16, -6, 2)],
  under: [V(0, -58, 62), V(0, 3, -4)],
  arch: [V(0, 46, 76), V(0, -6, 0)],
};

// ---------- сцена ----------
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(30, 50, 60);
  const rim = new THREE.DirectionalLight('#b9d8f2', 0.9); rim.position.set(-50, 20, -40);
  scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#cfe0ee', 0.5));

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 600);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 34, maxDistance: 150, autoRotateSpeed: 1.2 });

  const root = new THREE.Group(); root.position.z = -4;
  const S = { upper: buildJaw('upper'), lower: buildJaw('lower') };
  S.upper.group.rotation.z = Math.PI; // верхняя челюсть — та же дуга, перевёрнутая коронками вниз
  const hinge = new THREE.Group(); hinge.position.set(0, 1.5, -26);
  S.upper.group.position.z = 26; hinge.add(S.upper.group);
  S.lower.group.position.y = -1.5;
  root.add(hinge, S.lower.group);
  scene.add(root);

  const st = { update: null, p: 1, t0: 0, open: 0.12, openTarget: 0.12, gum: 1, gumT: 1, bone: 0, boneT: 0, cam: null, mouthOpen: false, item: null };

  function apply(item) {
    for (const jaw of [S.upper, S.lower]) {
      jaw.extras.clear();
      jaw.teeth.forEach((t) => { t.mesh.visible = true; t.mesh.material = M.tooth; });
    }
    S.upper.group.visible = item.scene.hide !== 'upper';
    S.lower.group.visible = item.scene.hide !== 'lower';
    FADE.forEach((m) => (m.opacity = 1));
    st.item = item;
    st.update = MODES[item.mode](S);
    const s = item.scene;
    st.openTarget = s.open ?? 0.12;
    st.gumT = s.gum ?? 1;
    st.boneT = s.bone ?? 0;
  }
  function setMaterials() {
    M.gum.opacity = st.gum; M.gum.depthWrite = st.gum > 0.95;
    M.bone.opacity = st.bone;
    S.upper.bone.visible = S.lower.bone.visible = st.bone > 0.01;
    hinge.rotation.x = -st.open;
  }
  function snapCamera(name) { const [p, t] = CAMS[name]; camera.position.copy(p); controls.target.copy(t); }

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    // на узком экране расширяем угол обзора, чтобы модель целиком помещалась по ширине
    camera.fov = camera.aspect < 1.4 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * 1.4 / camera.aspect)) : 32;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  // Миниатюры: каждое состояние в финале, снятое тем же рендером.
  function thumbnails(items) {
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setSize(480, 320, false); camera.aspect = 1.5; camera.fov = 32; camera.updateProjectionMatrix();
    const out = {};
    for (const it of items) {
      apply(it); st.update(1);
      st.open = st.openTarget; st.gum = st.gumT; st.bone = st.boneT; setMaterials();
      snapCamera(it.scene.cam); camera.lookAt(controls.target);
      renderer.render(scene, camera);
      out[it.id] = canvas.toDataURL('image/webp', 0.85);
    }
    renderer.setSize(size.x, size.y, false); resize();
    st.gum = 1; st.bone = 0; st.open = 0.12; // без «проявления» десны после съёмки миниатюр
    return out;
  }

  function select(item, animate = true) {
    apply(item);
    st.mouthOpen = false;
    st.p = animate ? 0 : 1; st.t0 = performance.now();
    st.update(st.p);
    const [p, t] = CAMS[item.scene.cam];
    st.cam = { from: camera.position.clone(), fromT: controls.target.clone(), to: p.clone(), toT: t.clone(), t0: performance.now() };
    if (!animate) { snapCamera(item.scene.cam); st.cam = null; }
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    if (st.p < 1) { st.p = Math.min(1, (now - st.t0) / 1900); st.update(st.p); }
    if (st.cam) {
      const k = ease(clamp01((now - st.cam.t0) / 1300));
      camera.position.lerpVectors(st.cam.from, st.cam.to, k);
      controls.target.lerpVectors(st.cam.fromT, st.cam.toT, k);
      if (k >= 1) st.cam = null;
    }
    const f = 1 - Math.exp(-dt * 5);
    st.open = lerp(st.open, st.mouthOpen ? 0.55 : st.openTarget, f);
    st.gum = lerp(st.gum, st.gumT, f); st.bone = lerp(st.bone, st.boneT, f);
    setMaterials();
    controls.update();
    renderer.render(scene, camera);
  });
  controls.addEventListener('start', () => (st.cam = null));

  return {
    select,
    thumbnails,
    zoom(dir) { st.cam = null; const v = camera.position.clone().sub(controls.target); const len = THREE.MathUtils.clamp(v.length() * (dir > 0 ? 0.82 : 1.22), controls.minDistance, controls.maxDistance); camera.position.copy(controls.target).add(v.setLength(len)); },
    toggleRotate() { controls.autoRotate = !controls.autoRotate; return controls.autoRotate; },
    toggleMouth() { st.mouthOpen = !st.mouthOpen; return st.mouthOpen; },
    replay() { if (st.item) select(st.item); },
  };
}
