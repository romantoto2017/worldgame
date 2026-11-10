/* EMPIRE — modo Conquista mundial (estrategia en tiempo real con pausa) */
(() => {
'use strict';
const D = window.EMPIRE_DATA, C = D.countries, topo = D.topo, Q = window.CONQ_DATA;
const geoms = topo.objects.countries.geometries;
const geomBy = {}; geoms.forEach(g => (geomBy[g.properties.c] = g));
const PLAYABLE = Object.keys(C).filter(k => C[k].playable && geomBy[k] && Q[k]);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtInt = n => Math.round(n).toLocaleString('es-AR');
const up = s => s.toLocaleUpperCase('es');
const name = c => C[c].name;
const flagSrc = c => `flags/${c}.svg`;
const pick = a => a[Math.floor(Math.random() * a.length)];
// dinero en miles de millones de USD (B$)
function money(b) {
  const m = b * 1000, s = m < 0 ? '-' : ''; const a = Math.abs(m);
  if (a >= 1e6) return `${s}US$ ${(a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} bill.`;
  if (a >= 1000) return `${s}US$ ${(a / 1000).toLocaleString('es-AR', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })} mil M`;
  return `${s}US$ ${a.toLocaleString('es-AR', { maximumFractionDigits: a >= 10 ? 0 : 1 })} M`;
}
const fmtPow = p => fmtInt(p / 100);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dateOf = d => { const t = new Date(Date.UTC(2027, 0, 1) + Math.round(d) * 864e5); return `${t.getUTCDate()} ${MESES[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };

/* ======================= MAPA ======================= */
const W = 2000, LATMAX = 84, LATMIN = -58;
const my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const Y0 = my(LATMAX), H = (Y0 - my(LATMIN)) / (2 * Math.PI) * W;
const proj = (lon, lat) => [(lon + 180) / 360 * W, (Y0 - my(Math.max(-80, Math.min(LATMAX, lat)))) / (2 * Math.PI) * W];
function partsOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map(poly => {
    const path = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, A = 0, gx = 0, gy = 0, px, py;
    poly.forEach((ring, ri) => {
      let off = 0, prev = null; // desenrollar anillos que cruzan el antimeridiano
      ring.forEach(([lo, la], i) => {
        if (prev != null) { if (lo + off - prev > 180) off -= 360; else if (lo + off - prev < -180) off += 360; }
        prev = lo + off; const [x, y] = proj(lo + off, la);
        i ? path.lineTo(x, y) : path.moveTo(x, y);
        if (ri === 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (i) { const cr = px * y - x * py; A += cr; gx += (px + x) * cr; gy += (py + y) * cr; } px = x; py = y; }
      });
      path.closePath();
    });
    const c = Math.abs(A) > 1e-9 ? [gx / (3 * A), gy / (3 * A)] : [(x0 + x1) / 2, (y0 + y1) / 2];
    return { path, bb: [x0, y0, x1, y1], c, size: (x1 - x0) * (y1 - y0) };
  }).filter(p => p.size > 0);
}
const grayPath = new Path2D();
geoms.forEach(g => { if (!PLAYABLE.includes(g.properties.c)) partsOf(topojson.feature(topo, g).geometry).forEach(p => grayPath.addPath(p.path)); });
const RP = {}; PLAYABLE.forEach(k => { RP[k] = partsOf(topojson.feature(topo, geomBy[k]).geometry).sort((a, b) => b.size - a.size); });
const bbUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const bbCenter = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const terrBB = k => RP[k].reduce((a, p) => bbUnion(a, p.bb), RP[k][0].bb);
const homeC = k => RP[k][0].c; // centro del territorio principal
const wdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const ar = c => C[c].ar || 1.5;
const FULL = { np: '#DC143C' };
function raster(img, c, h) {
  const cv = document.createElement('canvas'); cv.height = h; cv.width = Math.round(h * ar(c));
  const x = cv.getContext('2d'); if (FULL[c]) { x.fillStyle = FULL[c]; x.fillRect(0, 0, cv.width, h); }
  x.drawImage(img, 0, 0, cv.width, h); return cv;
}
function flagRect(bb, center, c) {
  const w = bb[2] - bb[0], h = bb[3] - bb[1], r = ar(c);
  if (FULL[c]) return [bb[0], bb[1], w, h];
  const a = Math.min(r * 1.15, Math.max(r / 1.15, w / h));
  let fw = w, fh = w / a; if (fh < h) { fh = h; fw = h * a; }
  return [clamp(center[0] - fw / 2, bb[2] - fw, bb[0]), clamp(center[1] - fh / 2, bb[3] - fh, bb[1]), fw, fh];
}
const flagImg = {}, flagLo = {}, flagMid = new Map();
const loadFlags = () => Promise.all(PLAYABLE.map(c => new Promise(res => {
  const img = new Image(); img.onload = () => { flagImg[c] = img; flagLo[c] = raster(img, c, 200); res(); }; img.onerror = res; img.src = flagSrc(c);
})));
function midFlag(c) {
  if (flagMid.has(c)) { const v = flagMid.get(c); flagMid.delete(c); flagMid.set(c, v); return v; }
  if (!flagImg[c]) return flagLo[c];
  const cv = raster(flagImg[c], c, 800); flagMid.set(c, cv); if (flagMid.size > 40) flagMid.delete(flagMid.keys().next().value); return cv;
}

const mapCv = $('map'), ctx = mapCv.getContext('2d'), baseCv = document.createElement('canvas'), bctx = baseCv.getContext('2d');
const hitCtx = document.createElement('canvas').getContext('2d');
let vw = 0, vh = 0, dpr = 1, dirty = true;
const cam = { x: W / 2, y: H / 2, s: 1 };
const minS = () => Math.min(vw / W, vh / H) * 0.95;
function clampCam() { cam.s = clamp(cam.s, minS(), minS() * 80); cam.x = clamp(cam.x, 0, W); cam.y = clamp(cam.y, 0, H); dirty = true; }
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
  for (const c of [mapCv, baseCv]) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); }
  if (!cam.init) { cam.s = Math.min(vw / W, vh / H) * 1.1; cam.init = true; }
  clampCam();
}
addEventListener('resize', resize);
let anim = null;
function flyTo(bb, pad = 1.6) {
  const w = Math.max(bb[2] - bb[0], 20), h = Math.max(bb[3] - bb[1], 20);
  const tgt = { s: clamp(Math.min(vw / (w * pad), vh / (h * pad)), minS(), minS() * 30), x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 };
  const a = { ...cam }, t0 = performance.now();
  anim = now => { const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
    cam.s = Math.exp(Math.log(a.s) + (Math.log(tgt.s) - Math.log(a.s)) * e); cam.x = a.x + (tgt.x - a.x) * e; cam.y = a.y + (tgt.y - a.y) * e; dirty = true; return k < 1; };
}
const toScreen = ([x, y]) => [(x - cam.x) * cam.s + vw / 2, (y - cam.y) * cam.s + vh / 2];

// geometría fusionada por dueño
const ownCache = {};
function ownerParts(o) {
  if (ownCache[o]) return ownCache[o];
  const regs = G.terrOf[o] || [];
  const parts = regs.length === 1 ? RP[regs[0]] : partsOf(topojson.merge(topo, regs.map(r => geomBy[r]))).sort((a, b) => b.size - a.size);
  let bb = parts.length ? parts[0].bb : [0, 0, 1, 1]; const near = parts.length ? bbGrow(parts[0].bb, 1) : bb;
  parts.forEach(p => { if (p.bb[0] < near[2] && p.bb[2] > near[0] && p.bb[1] < near[3] && p.bb[3] > near[1]) bb = bbUnion(bb, p.bb); });
  return (ownCache[o] = { parts, bb });
}
function bbGrow(b, f) { const w = (b[2] - b[0]) * f, h = (b[3] - b[1]) * f; return [b[0] - w, b[1] - h, b[2] + w, b[3] + h]; }
let borderPath = null;
function invalidateOwners(...os) { os.forEach(o => delete ownCache[o]); borderPath = null; dirty = true; }

function setT(c) { const k = cam.s * dpr; c.setTransform(k, 0, 0, k, (vw / 2 - cam.x * cam.s) * dpr, (vh / 2 - cam.y * cam.s) * dpr); }
function drawFlag(c, o, parts, x0, y0, x1, y1) {
  for (const p of parts) {
    const b = p.bb; if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    const sw = (b[2] - b[0]) * cam.s; if (sw < 0.6 && (b[3] - b[1]) * cam.s < 0.6) continue;
    const img = sw > 260 ? midFlag(o) : flagLo[o];
    c.save(); c.clip(p.path); if (img) c.drawImage(img, ...flagRect(b, p.c, o)); else { c.fillStyle = '#555'; c.fill(p.path); } c.restore();
  }
}
// capa base: banderas, fronteras, ocupaciones (se redibuja solo cuando cambia algo)
function renderBase() {
  const c = bctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#101a27'; c.fillRect(0, 0, baseCv.width, baseCv.height);
  setT(c);
  const x0 = cam.x - vw / 2 / cam.s, x1 = cam.x + vw / 2 / cam.s, y0 = cam.y - vh / 2 / cam.s, y1 = cam.y + vh / 2 / cam.s;
  c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1 / cam.s; c.beginPath();
  const step = W / 40;
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { c.moveTo(x, y0); c.lineTo(x, y1); }
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { c.moveTo(x0, y); c.lineTo(x1, y); }
  c.stroke();
  c.fillStyle = '#3a4352'; c.fill(grayPath);
  if (!G) {
    PLAYABLE.forEach(k => drawFlag(c, k, RP[k], x0, y0, x1, y1));
    c.strokeStyle = 'rgba(8,12,20,.55)'; c.lineWidth = .9 / cam.s; PLAYABLE.forEach(k => RP[k].forEach(p => c.stroke(p.path)));
    if (pickSel) { c.strokeStyle = '#fff'; c.lineWidth = 2.4 / cam.s; RP[pickSel].forEach(p => c.stroke(p.path)); }
    return;
  }
  const owners = alive();
  owners.forEach(o => drawFlag(c, o, ownerParts(o).parts, x0, y0, x1, y1));
  if (!borderPath) { borderPath = new Path2D(); owners.forEach(o => ownerParts(o).parts.forEach(p => borderPath.addPath(p.path))); }
  c.strokeStyle = 'rgba(8,12,20,.6)'; c.lineWidth = .9 / cam.s; c.stroke(borderPath);
  // ocupaciones: la bandera del invasor avanza desde su lado como un frente
  for (const t of PLAYABLE) {
    const oc = G.terr[t].occ; if (!oc || oc.pct <= 0 || !G.n[oc.by]) continue;
    const bb = terrBB(t), from = attackOrigin(oc.by, t);
    const org = [clamp(from[0], bb[0], bb[2]), clamp(from[1], bb[1], bb[3])];
    const maxR = Math.max(...[[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(p => wdist(p, org)));
    const r = maxR * oc.pct / 100;
    for (const p of RP[t]) {
      c.save(); c.clip(p.path); c.beginPath(); c.arc(org[0], org[1], r, 0, 7); c.clip();
      if (flagLo[oc.by]) c.drawImage(flagLo[oc.by], ...flagRect(bb, bbCenter(bb), oc.by)); c.restore();
      c.save(); c.clip(p.path); c.beginPath(); c.arc(org[0], org[1], r, 0, 7);
      c.setLineDash([6 / cam.s, 4 / cam.s]); c.strokeStyle = '#ff3d3d'; c.lineWidth = 2.4 / cam.s; c.stroke(); c.restore();
    }
    c.lineWidth = 1.6 / cam.s; c.strokeStyle = 'rgba(255,61,61,.9)'; RP[t].forEach(p => c.stroke(p.path));
  }
  if (G.n[G.me]) { c.strokeStyle = '#ffc83a'; c.lineWidth = 2 / cam.s; ownerParts(G.me).parts.forEach(p => c.stroke(p.path)); }
  if (sel && G.n[sel]) { c.strokeStyle = '#fff'; c.lineWidth = 2.6 / cam.s; ownerParts(sel).parts.forEach(p => c.stroke(p.path)); }
  for (const o of owners) { // microestados: punto con bandera
    const f = ownerParts(o).bb; if ((f[2] - f[0]) * cam.s > 7 || (f[3] - f[1]) * cam.s > 7) continue;
    const [cx, cy] = bbCenter(f), r = (o === G.me ? 6 : 3.6) / cam.s;
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.clip();
    if (flagLo[o]) c.drawImage(flagLo[o], ...flagRect([cx - r, cy - r, cx + r, cy + r], [cx, cy], o)); c.restore();
    c.beginPath(); c.arc(cx, cy, r, 0, 7); c.strokeStyle = o === G.me ? '#ffc83a' : 'rgba(255,255,255,.85)'; c.lineWidth = 1 / cam.s; c.stroke();
  }
}
function attackOrigin(o, t) { // desde qué territorio propio ataca o a t
  const own = G.terrOf[o] || []; const adj = own.filter(x => C[t].adj.includes(x));
  const pool = adj.length ? adj : own; const tc = homeC(t);
  if (!pool.length) return tc;
  return homeC(pool.reduce((b, x) => (wdist(homeC(x), tc) < wdist(homeC(b), tc) ? x : b), pool[0]));
}
function arrow(p0, p1, color, now, w = 3) {
  const [x0, y0] = toScreen(p0), [x1, y1] = toScreen(p1), dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 8) return;
  const mx = (x0 + x1) / 2 - dy * .18, my2 = (y0 + y1) / 2 + dx * .18; // curva leve
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = w + 3;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my2, x1, y1); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now / 25;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my2, x1, y1); ctx.stroke();
  const a = Math.atan2(y1 - my2, x1 - mx), s = 6 + w * 2; ctx.setLineDash([]); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - s * Math.cos(a - .45), y1 - s * Math.sin(a - .45)); ctx.lineTo(x1 - s * Math.cos(a + .45), y1 - s * Math.sin(a + .45)); ctx.fill();
  const p = (now / 260) % 1; ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 2; // destello de combate
  ctx.beginPath(); ctx.arc(x1, y1, 4 + p * 12, 0, 7); ctx.stroke(); ctx.restore();
}
let tokens = []; // fichas de ejércitos en pantalla (para tocarlas)
function render(now) {
  if (dirty) { dirty = false; renderBase(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(baseCv, 0, 0);
  tokens = [];
  if (!G) return;
  for (const t of PLAYABLE) { const oc = G.terr[t].occ; if (oc && G.n[oc.by] && oc.by !== G.me) arrow(attackOrigin(oc.by, t), homeC(t), '#ff4d4d', now, 2.5); }
  if (!G.n[G.me]) return;
  for (const a of G.armies) {
    const pos = armyPos(a);
    if (a.tgt && !a.to) arrow(pos, homeC(a.tgt), '#ffc83a', now, 3.5);
    if (a.to) arrow(pos, homeC(a.to), 'rgba(140,200,255,.9)', now, 2);
  }
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.font = '800 12px Inter, sans-serif'; ctx.textBaseline = 'middle';
  const myP = power(G.me), seen = {};
  G.armies.forEach((a, i) => {
    const [x, y0] = toScreen(armyPos(a)), key = a.to ? 'm' + i : a.at, y = y0 + (seen[key] = (seen[key] ?? -1) + 1) * 30;
    const label = `${i + 1} · ${fmtPow(myP * a.frac)}`, w = ctx.measureText(label).width + 40, h = 26, bx = x - w / 2, by = y - h / 2;
    const on = a === selArmy;
    ctx.fillStyle = on ? '#ffc83a' : 'rgba(15,22,32,.94)'; ctx.strokeStyle = on ? '#fff' : '#ffc83a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx, by, w, h, 13); ctx.fill(); ctx.stroke();
    if (flagLo[G.me]) { ctx.save(); ctx.beginPath(); ctx.arc(bx + 14, by + h / 2, 9, 0, 7); ctx.clip(); ctx.drawImage(flagLo[G.me], ...flagRect([bx + 5, by + h / 2 - 9, bx + 23, by + h / 2 + 9], [bx + 14, by + h / 2], G.me)); ctx.restore(); }
    ctx.fillStyle = on ? '#111' : '#fff'; ctx.fillText(label, bx + 28, by + h / 2 + 1);
    if (a.tgt && !a.to) { ctx.fillStyle = '#ff3d3d'; ctx.beginPath(); ctx.arc(bx + w - 2, by + 2, 5, 0, 7); ctx.fill(); }
    tokens.push({ a, x: bx, y: by, w, h });
  });
  ctx.restore();
}
function hitTest(sx, sy) {
  const wx = cam.x + (sx - vw / 2) / cam.s, wy = cam.y + (sy - vh / 2) / cam.s;
  for (const k of PLAYABLE) for (const p of RP[k]) {
    const b = p.bb; if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue;
    if (hitCtx.isPointInPath(p.path, wx, wy)) return k;
  }
  let best = null, bd = 14 / cam.s; // microestados: tocar cerca del punto
  for (const k of PLAYABLE) { const d = wdist(homeC(k), [wx, wy]); if (d < bd) { bd = d; best = k; } }
  return best;
}

/* ======================= REGLAS ======================= */
const ICON = { // íconos simples de trazo (24×24)
  inf: 'M5 13a7 7 0 0 1 14 0v1H5z M3 14h18 M9 17h6 M12 14v6', rifle: 'M2 12h13l5-2v3l-5 1H9l-2 4H5l1-4H2z M13 10V8',
  rpg: 'M2 12h13 M15 9l6 3-6 3z M6 12v4 M10 12v3', tank: 'M3 15h18l-2 4H5z M6 15v-3h10v3 M11 12V9h9', art: 'M3 19h11 M6 19l4-7 M10 12l11-6 M7 19a2 2 0 1 0 .1 0',
  mlrs: 'M3 17h13v-4H3z M7 13l11-6 M10 13l11-6 M5 17v2 M14 17v2', air: 'M12 2l1.5 7 8 4v2l-8-2-.8 5 3 2v1l-3.7-.8-3.7.8v-1l3-2-.8-5-8 2v-2l8-4z',
  heli: 'M2 6h20 M12 6v3 M6 13a6 4 0 0 0 12 0 6 4 0 0 0-12 0 M18 13h4 M9 17l-1 3 M15 17l1 3', drone: 'M6 6l12 12 M18 6L6 18 M3 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M15 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  sam: 'M3 20h18 M7 20l5-12 5 12 M12 8V3 M10 5l2-2 2 2', ship: 'M2 15h20l-3 5H5z M6 15v-3h11v3 M10 12V8h4v4 M12 8V4',
};
// armamento: precio en millones de USD por lote, días de entrega mínimos, poder por unidad
const UNITS = {
  inf: { n: 'Soldados', lot: 1000, price: 30, days: 45, pow: 1, desc: '1.000 soldados entrenados' },
  rifle: { n: 'Fusiles AK-47', lot: 1000, price: 0.6, days: 7, pow: 0, desc: 'Sin fusil un soldado rinde 25 %' },
  rpg: { n: 'Lanzacohetes RPG-7', lot: 100, price: 1.2, days: 10, pow: 4, desc: 'Antitanque portátil' },
  tank: { n: 'Tanques', lot: 1, price: 6, days: 60, pow: 60, desc: 'Blindado principal' },
  art: { n: 'Artillería', lot: 1, price: 3, days: 45, pow: 30, desc: 'Obús de 155 mm' },
  mlrs: { n: 'Lanzacohetes múltiples', lot: 1, price: 5, days: 60, pow: 50, desc: 'Cohetes de saturación' },
  air: { n: 'Aviones de combate', lot: 1, price: 70, days: 180, pow: 200, desc: 'Caza polivalente' },
  heli: { n: 'Helicópteros', lot: 1, price: 30, days: 120, pow: 70, desc: 'Ataque y apoyo cercano' },
  drone: { n: 'Drones', lot: 10, price: 20, days: 20, pow: 20, desc: 'Drones de ataque' },
  sam: { n: 'Antiaéreos', lot: 1, price: 50, days: 90, pow: 60, desc: 'Misiles (solo defensa)' },
  ship: { n: 'Buques de guerra', lot: 1, price: 600, days: 365, pow: 50, desc: 'Permite invadir por mar' },
};
const UK = Object.keys(UNITS);
const IDEO = {
  dem: { n: 'Democracia', tax: 1, growth: .01, atk: 1, def: 1, rec: 1, qolm: 1.2, aggr: .35,
    d: [['pos', 'Libre mercado: crecimiento +1 %'], ['pos', 'Calidad de vida +20 % por peso invertido'], ['neg', 'Opinión pública: declarar guerra baja la estabilidad']] },
  soc: { n: 'Socialismo', tax: 1.1, growth: 0, atk: 1, def: 1.05, rec: .95, qolm: 1.5, aggr: .6,
    d: [['pos', 'Estado de bienestar: calidad de vida +50 % por peso'], ['pos', 'Recaudación +10 %'], ['neg', 'Sin bonus de crecimiento']] },
  com: { n: 'Comunismo', tax: 1.25, growth: -.01, atk: 1, def: 1.1, rec: .7, qolm: 1, aggr: 1.1,
    d: [['pos', 'Economía planificada: recaudación +25 %'], ['pos', 'Llamado a las armas: reclutar cuesta 30 % menos'], ['neg', 'Estancamiento: crecimiento −1 %']] },
  aut: { n: 'Autoritarismo', tax: 1.05, growth: 0, atk: 1.1, def: 1.05, rec: .85, qolm: .8, aggr: 1.4,
    d: [['pos', 'Ataque +10 %'], ['pos', 'Reclutar cuesta 15 % menos'], ['neg', 'Calidad de vida −20 % por peso']] },
  fas: { n: 'Fascismo', tax: 1, growth: -.005, atk: 1.25, def: 1.05, rec: .8, qolm: .7, aggr: 2, rel: -15,
    d: [['pos', 'Militarismo: ataque +25 %'], ['pos', 'Reclutar cuesta 20 % menos'], ['neg', 'Relaciones con todos −15'], ['neg', 'Crecimiento −0,5 %']] },
  mon: { n: 'Monarquía', tax: 1.1, growth: 0, atk: 1, def: 1.1, rec: 1, qolm: .9, aggr: .8, stab: 10,
    d: [['pos', 'Recaudación +10 %'], ['pos', 'Estabilidad +10'], ['neg', 'Calidad de vida −10 % por peso']] },
  teo: { n: 'Teocracia', tax: 1, growth: -.005, atk: 1, def: 1.25, rec: .9, qolm: .9, aggr: 1, stab: 5,
    d: [['pos', 'Fervor: defensa +25 %'], ['pos', 'Reclutar cuesta 10 % menos'], ['neg', 'Crecimiento −0,5 %']] },
  ana: { n: 'Anarquismo', tax: .35, growth: 0, atk: .6, def: 1.5, rec: 1.2, qolm: 1.5, aggr: 0,
    d: [['pos', 'Guerrilla: defensa +50 %'], ['pos', 'Autogestión: calidad de vida +50 % por peso'], ['neg', 'Sin Estado: recaudación −65 %'], ['neg', 'Ataque −40 %']] },
};
const IDEO0 = { cn: 'com', cu: 'com', vn: 'com', la: 'com', kp: 'com', sa: 'mon', ae: 'mon', qa: 'mon', kw: 'mon', om: 'mon', bh: 'mon', jo: 'mon',
  ma: 'mon', bn: 'mon', sz: 'mon', ir: 'teo', af: 'teo', va: 'teo', ru: 'aut', by: 'aut', mm: 'aut', er: 'aut', tm: 'aut', tj: 'aut', sy: 'aut', ve: 'soc', ni: 'soc' };
const BLOCS = {
  OTAN: 'us ca gb fr de it es pt nl be lu dk no is pl cz sk hu ro bg gr tr al hr si me mk ee lv lt fi se',
  UE: 'at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se',
  OTSC: 'ru by kz kg tj am', Mercosur: 'ar br uy py bo', ASEAN: 'id my ph sg th vn la kh mm bn', CCG: 'sa ae qa kw om bh', ALBA: 've cu ni bo',
  'Liga Árabe': 'dz bh km dj eg iq jo kw lb ly mr ma om ps qa sa so sd sy tn ae ye',
};
const blocOf = {}; for (const [b, l] of Object.entries(BLOCS)) l.split(' ').forEach(k => (blocOf[k] = blocOf[k] || []).push(b));
const SPECIAL = 'us-ve 20,us-ir 8,us-kp 5,us-cu 25,us-ru 18,us-cn 30,ru-ua 0,il-ir 0,in-pk 10,cn-tw 8,kp-kr 5,am-az 10,sa-ir 20,ma-dz 22,gr-tr 42,' +
  'cn-in 30,cn-jp 28,ru-pl 15,ru-lt 15,ru-lv 15,ru-ee 15,ru-ge 15,il-sy 5,il-lb 10,et-er 20,sd-ss 25,ve-co 35,ve-gy 18,rs-xk 10,ru-gb 15,ir-gb 20,' +
  'ye-sa 12,pk-af 25,kh-th 40,jp-kp 5,jp-kr 62,us-gb 95,us-il 90,us-ca 95,us-jp 88,us-kr 90,us-au 95,ru-by 95,ru-cn 75,cn-kp 80,cn-pk 90,us-tw 80,' +
  'ru-ir 70,ru-sy 80,ve-cu 92,ru-ve 70,ru-kp 78,us-mx 70,us-ph 80,fr-de 92,ar-gb 30,ar-uy 96,ar-br 88,ar-cl 85,us-sa 70,ir-sy 85,ua-pl 85,cn-ph 25,cn-vn 40,' +
  'us-ua 70,gb-ua 75,de-ua 70,fr-ua 70,ua-lt 80,ua-by 15';
const SP = {}; SPECIAL.split(',').forEach(s => { const [p, v] = s.split(' '); SP[p] = +v; SP[p.split('-').reverse().join('-')] = +v; });
const ALLY0 = [];
const pairs = l => { const a = l.split(' ').filter(k => Q[k]); a.forEach((x, i) => a.slice(i + 1).forEach(y => ALLY0.push([x, y]))); };
pairs(BLOCS.OTAN); pairs(BLOCS.OTSC); pairs(BLOCS.CCG); pairs('ve cu ni');
['jp', 'kr', 'au', 'ph', 'il', 'tw', 'nz'].forEach(k => ALLY0.push(['us', k])); ALLY0.push(['ru', 'kp'], ['cn', 'kp'], ['ru', 'by'], ['cn', 'pk'], ['ru', 'sy']);
const pk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/* ======================= ESTADO ======================= */
let G = null, sel = null, pickSel = null, selArmy = null;
const alive = () => Object.keys(G.n);
const SAVE = 'empire.conq2';
const store = v => { try { v == null ? localStorage.removeItem(SAVE) : localStorage.setItem(SAVE, JSON.stringify(v)); } catch {} };
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } };

const gdppc = k => Q[k].gdp * 1e9 / Math.max(1, Q[k].pop);
function initialUnits(k) {
  const [per, tank, air, art, heli, ship] = Q[k].mil, inf = per * 1000;
  return { inf, rifle: inf, rpg: Math.round(inf / 40), tank, art: Math.round(art * .7), mlrs: Math.round(art * .3), air, heli, drone: air * 2, sam: Math.round(air * .2), ship };
}
function newGame(me) {
  const g = { v: 2, me, day: 0, tension: 25, n: {}, terr: {}, owner: {}, terrOf: {}, rel: {}, ally: {}, wars: [], q: [], log: [],
    armies: [{ id: 1, at: me, to: null, dep: 0, arr: 0, frac: 1, tgt: null }], armySeq: 1, nextEvent: 150 + Math.floor(Math.random() * 120), seen: [] };
  for (const k of PLAYABLE) {
    const pc = gdppc(k), lvl = clamp(15 + 25 * Math.log10(pc / 400), 8, 95);
    g.terr[k] = { gdp: Q[k].gdp, pop: Q[k].pop, infra: lvl, qol: clamp(lvl - 3, 8, 95), occ: null };
    g.owner[k] = k; g.terrOf[k] = [k];
    const ideo = IDEO0[k] || 'dem', u = initialUnits(k);
    const spend = Q[k].gdp * Q[k].milPct / 100 * 1e9 / Math.max(1, u.inf); // USD por soldado
    // tecnología: depende sobre todo de la riqueza del país (industria, educación, mantenimiento) y del gasto por soldado
    const tech = clamp(.35 + .3 * Math.log10(pc / 1000) + .15 * Math.log10(spend / 1e4), .3, 1.5);
    g.n[k] = { ideo, ideoDay: -999, stab: clamp(30 + lvl * .5 + (ideo === 'dem' ? 0 : 6), 25, 85), treasury: Q[k].gdp * .01, fund: Q[k].gdp * Q[k].milPct / 100 * .1,
      bud: { mil: clamp(Q[k].milPct / 12 * 100, 2, 90), infra: 20, qol: 35 }, u, tech, pm: clamp(Math.pow(pc / 20000, .8), .25, 3.5), cf: 1,
      wins: 0, prio: null, relDay: {}, line: 0, lineInf: 0, xfer: -99 };
  }
  ALLY0.forEach(([a, b]) => { if (g.n[a] && g.n[b]) g.ally[pk(a, b)] = 1; });
  const tmp = G; G = g;
  // cada país arranca gastando ~85 % de su presupuesto militar real en mantener su ejército real
  for (const k of PLAYABLE) { const n = g.n[k], mb = revenue(k) * n.bud.mil / 100; n.cf = clamp(.85 * mb / Math.max(1e-6, upkeep(k)), .3, 4); }
  G = tmp;
  // situación real de partida: la guerra de Rusia en Ucrania ya está en curso
  g.wars.push({ a: 'ru', b: 'ua', day: 0, r: 1 }); g.terr.ua.occ = { by: 'ru', pct: 18 };
  g.n.ua.aid = 1.7; g.n.ua.u0 = { ...g.n.ua.u }; // ayuda militar occidental (se va reduciendo con los años)
  return g;
}

/* ======================= CÁLCULOS ======================= */
const ideoOf = k => IDEO[G.n[k].ideo];
function power(k, defending) {
  const n = G.n[k]; if (!n) return 0; const u = n.u, I = ideoOf(k);
  const armed = Math.min(u.inf, u.rifle);
  let p = armed + (u.inf - armed) * .25 + Math.min(u.rpg, u.inf / 10) * 4;
  for (const t of ['tank', 'art', 'mlrs', 'air', 'heli', 'drone', 'ship']) p += u[t] * UNITS[t].pow;
  if (defending) p += u.sam * UNITS.sam.pow;
  return p * n.tech * (defending ? I.def : I.atk) * (.5 + n.stab / 200) * (n.aid || 1);
}
function gdpOf(k) { let s = 0; for (const t of G.terrOf[k] || []) s += G.terr[t].gdp * clamp((G.terr[t].infra + 20) / 100, .2, 1); return s; }
const popOf = k => (G.terrOf[k] || []).reduce((s, t) => s + G.terr[t].pop, 0);
// B$/año: solo la parte del gasto público que decide el jugador (el resto: jubilaciones, administración, deuda)
const revenue = k => gdpOf(k) * .12 * ideoOf(k).tax;
function upkeep(k) { // B$/año
  const n = G.n[k], u = n.u; let s = u.inf * 1.2e-4 * n.pm;
  for (const t of UK) if (t !== 'inf' && t !== 'rifle') s += u[t] / UNITS[t].lot * UNITS[t].price * .25 / 1000;
  return s * n.cf;
}
// capacidad de las fábricas militares (B$/año) y de los cuarteles (soldados/año): se duplica en guerra
const factory = k => gdpOf(k) * .012 * (warsOf(k).length ? 2 : 1);
const barracks = k => popOf(k) * .004 * (warsOf(k).length ? 2 : 1);
const avgQol = k => { const ts = G.terrOf[k] || []; return ts.reduce((s, t) => s + G.terr[t].qol, 0) / Math.max(1, ts.length); };
function relBase(a, b) {
  const key = a + '-' + b; if (SP[key] != null) return SP[key];
  let r = 50; const A = Q[a], B = Q[b];
  if (C[a].adj.includes(b)) r += 22;
  if (A.sub && A.sub === B.sub) r += 10; else if (A.reg && A.reg === B.reg) r += 5;
  if (A.lang.some(l => B.lang.includes(l) && l !== 'eng')) r += 10;
  if ((blocOf[a] || []).some(x => (blocOf[b] || []).includes(x))) r += 18;
  return clamp(r, 0, 100);
}
function rel(a, b) {
  if (a === b) return 100;
  if (atWar(a, b)) return 0;
  const ia = ideoOf(a), ib = ideoOf(b);
  let r = relBase(a, b) + (G.rel[pk(a, b)] || 0) + (ia === ib ? 8 : 0) + (ia.rel || 0) + (ib.rel || 0);
  if ((G.n[a].ideo === 'dem') !== (G.n[b].ideo === 'dem')) r -= 6;
  return Math.round(clamp(r, 0, 100));
}
const addRel = (a, b, d) => { const k = pk(a, b); G.rel[k] = clamp((G.rel[k] || 0) + d, -100, 100); };
const allied = (a, b) => !!G.ally[pk(a, b)];
const atWar = (a, b) => G.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
const warsOf = k => G.wars.filter(w => w.a === k || w.b === k);
const enemiesOf = k => warsOf(k).map(w => (w.a === k ? w.b : w.a));
const alliesOf = k => alive().filter(o => o !== k && allied(k, o));
let nbCache = null;
function landNeighbors(k) {
  nbCache = nbCache || {};
  if (nbCache[k]) return nbCache[k];
  const s = new Set(); for (const t of G.terrOf[k] || []) for (const a of C[t].adj) { const o = G.owner[a]; if (o && o !== k) s.add(o); }
  return (nbCache[k] = s);
}
const navalRange = k => (G.n[k].u.ship >= 5 ? 120 + G.n[k].u.ship * 2.5 : 0);
function seaTarget(a, b, max = 1e9, from) { // territorio costero de b alcanzable por mar desde a
  const rng = Math.min(max, navalRange(a)); if (!rng) return null;
  const fr = (from ? [from] : G.terrOf[a] || []).map(homeC); let best = null, bd = rng;
  for (const t of G.terrOf[b] || []) { if (Q[t].ll) continue; for (const f of fr) { const d = wdist(f, homeC(t)); if (d < bd) { bd = d; best = t; } } }
  return best;
}
const canReach = (a, b) => landNeighbors(a).has(b) || !!seaTarget(a, b);
function threatOf(k) { return [...new Set([...landNeighbors(k), ...enemiesOf(k)])].filter(o => rel(k, o) < 35).reduce((s, o) => s + power(o), 0); }
// fortaleza integral de un país: ejército × economía × calidad de vida, con aliados y amenazas
function strengthParts(k) {
  const P = power(k), allies = alliesOf(k).filter(x => rel(k, x) >= 50).reduce((s, x) => s + power(x), 0);
  return { P, gdp: gdpOf(k), qol: avgQol(k), allies, threat: threatOf(k) };
}
function strengthScore(k) {
  const s = strengthParts(k), mil = s.P + Math.min(s.allies * .2, s.P);
  return Math.sqrt(mil) * Math.sqrt(s.gdp * 1000) * (.5 + s.qol / 120) / (1 + .6 * s.threat / (s.P + 1));
}

/* ======================= EJÉRCITOS DEL JUGADOR ======================= */
function armyPos(a) {
  if (!a.to) return homeC(a.at);
  const k = clamp((G.day + dayFrac() - a.dep) / Math.max(1, a.arr - a.dep), 0, 1), p0 = homeC(a.at), p1 = homeC(a.to);
  return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k];
}
const travelDays = (from, to) => Math.max(2, Math.ceil(wdist(homeC(from), homeC(to)) / (C[from].adj.includes(to) || from === to ? 14 : 9)));
function moveArmy(a, dest, then = null) {
  const from = a.to ? a.to : a.at; // si ya viajaba, sale desde su destino anterior
  if (from === dest) { a.at = dest; a.to = null; a.tgt = then; return; }
  a.at = from; a.to = dest; a.dep = G.day; a.arr = G.day + travelDays(from, dest); a.tgt = null; a.then = then;
}
const armyName = a => `Ejército ${G.armies.indexOf(a) + 1}`;
function orderArmy(a, t) {
  const me = G.me, o = G.owner[t];
  if (o === me) { moveArmy(a, t); return a.to ? `${armyName(a)} marcha a ${name(t)} (${a.arr - G.day} días)` : `${armyName(a)} se queda en ${name(t)}`; }
  if (!atWar(me, o)) return `No estás en guerra con ${name(o)}: tocá el país y declarale la guerra`;
  const pos = a.to || a.at;
  if (C[t].adj.includes(pos) && G.owner[pos] === me) { if (a.to) a.then = t; else a.tgt = t; return `${armyName(a)} ataca ${name(t)}`; }
  const stage = (G.terrOf[me] || []).filter(x => C[t].adj.includes(x)).sort((x, y) => wdist(homeC(x), homeC(pos)) - wdist(homeC(y), homeC(pos)))[0];
  if (stage) { moveArmy(a, stage, t); return `${armyName(a)} marcha a ${name(stage)} para atacar ${name(t)}`; }
  if (!Q[t].ll && seaTarget(me, o, 1e9, pos) === t) { if (a.to) a.then = t; else a.tgt = t; return `${armyName(a)} desembarca en ${name(t)} (por mar rinde la mitad)`; }
  const sea = seaTarget(me, o); if (sea) return `No llegás a ${name(t)}. Por mar podés atacar ${name(sea)}`;
  return `No llegás a ${name(t)}: necesitás frontera o más buques de guerra`;
}
function splitArmy(a) { if (a.frac < .1) return toast('Es muy chico para dividirlo'); const b = { id: ++G.armySeq, at: a.to || a.at, to: null, dep: 0, arr: 0, frac: a.frac / 2, tgt: null }; a.frac /= 2; G.armies.push(b); selArmy = b; }
function mergeArmies(a) {
  const here = a.to || a.at, others = G.armies.filter(b => b !== a && !b.to && b.at === here);
  if (!others.length) return toast('No hay otro ejército en el mismo lugar');
  others.forEach(b => { a.frac += b.frac; G.armies.splice(G.armies.indexOf(b), 1); });
}
function fixArmies() { // tras cambios de fronteras: los ejércitos que quedaron afuera vuelven al territorio propio más cercano
  const mine = G.terrOf[G.me] || []; if (!mine.length) return;
  for (const a of G.armies) {
    if (!mine.includes(a.at)) { const p = armyPos(a); a.at = mine.reduce((b, x) => (wdist(homeC(x), p) < wdist(homeC(b), p) ? x : b), mine[0]); a.to = null; a.tgt = null; }
    if (a.to && !mine.includes(a.to)) { a.to = null; a.tgt = null; a.then = null; }
    if (a.tgt && (!G.n[G.owner[a.tgt]] || G.owner[a.tgt] === G.me || !atWar(G.me, G.owner[a.tgt]))) a.tgt = null;
  }
}

/* ======================= GUERRA ======================= */
function news(msg, cls = '', mine = false) {
  G.log.unshift({ d: G.day, msg }); G.log.length = Math.min(G.log.length, 60);
  if (mine) pushNews(msg, cls);
}
function declareWar(a, b, depth = 0) {
  if (a === b || atWar(a, b) || !G.n[a] || !G.n[b]) return;
  if (allied(a, b)) delete G.ally[pk(a, b)];
  G.wars.push({ a, b, day: G.day, r: 1 });
  G.tension = clamp(G.tension + 1.5, 0, 100);
  addRel(a, b, -60);
  alive().forEach(o => { if (o !== a && o !== b && rel(o, b) >= 70) addRel(o, a, -10); });
  if (a === G.me && G.n[a].ideo === 'dem') G.n[a].stab = clamp(G.n[a].stab - 8, 0, 100);
  const mine = a === G.me || b === G.me, big = power(a) > 3e5 || power(b) > 3e5; // las guerras grandes son noticia aunque no te toquen
  news(`⚔️ ${name(a)} declaró la guerra a ${name(b)}`, mine ? '' : 'info', mine || big);
  if (depth > 1) return;
  for (const x of alliesOf(b)) {
    if (x === a || atWar(x, a) || rel(x, b) < 50 || allied(x, a)) continue;
    if (x === G.me) askHelp(b, a);
    else if (canReach(x, a) && Math.random() < rel(x, b) / 140) { declareWar(x, a, depth + 1); news(`🛡️ ${name(x)} entra en la guerra para defender a ${name(b)}`, '', b === G.me || a === G.me); }
  }
}
function makePeace(a, b) {
  G.wars = G.wars.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
  for (const t of PLAYABLE) { const oc = G.terr[t].occ; if (oc && ((oc.by === a && G.owner[t] === b) || (oc.by === b && G.owner[t] === a))) G.terr[t].occ = null; }
  addRel(a, b, 25); G.tension = clamp(G.tension - 1, 0, 100);
  news(`🕊️ Paz entre ${name(a)} y ${name(b)}`, 'good', a === G.me || b === G.me); dirty = true;
  if (G.n[G.me] && (a === G.me || b === G.me)) fixArmies();
}
function transfer(t, to) {
  const from = G.owner[t];
  G.terrOf[from] = G.terrOf[from].filter(x => x !== t); (G.terrOf[to] = G.terrOf[to] || []).push(t);
  G.owner[t] = to; const T = G.terr[t]; T.occ = null; T.infra *= .6; T.qol = Math.max(5, T.qol - 15);
  invalidateOwners(from, to); nbCache = null;
  if (G.n[from]) G.n[from].stab = clamp(G.n[from].stab - 6, 0, 100);
  if (G.n[G.me] && (from === G.me || to === G.me)) fixArmies();
  return from;
}
function eliminate(k, by) {
  const u = G.n[k].u, w = G.n[by].u; for (const t of ['tank', 'art', 'mlrs', 'heli', 'rifle']) w[t] += Math.round(u[t] * .25);
  G.n[by].treasury += Math.max(0, G.n[k].treasury) * .5; G.n[by].wins++;
  delete G.n[k]; G.wars = G.wars.filter(x => x.a !== k && x.b !== k);
  Object.keys(G.ally).forEach(p => { if (p.split('|').includes(k)) delete G.ally[p]; });
  for (const t of PLAYABLE) if (G.terr[t].occ && G.terr[t].occ.by === k) G.terr[t].occ = null;
  if (sel === k) sel = null;
  news(`🏳️ ${name(k)} capituló ante ${name(by)}`, by === G.me ? 'good' : '', true);
  if (k === G.me) { G.dead = by; selArmy = null; setSpeed(0); showDefeat(by); return; }
  if (alive().length === 1) { setSpeed(0); showVictory(alive()[0]); }
  if (G.n[G.me]) fixArmies();
}
function conquer(t, by) {
  const from = transfer(t, by);
  news(`🚩 ${name(by)} conquistó ${name(t)}`, by === G.me ? 'good' : '', by === G.me || from === G.me);
  if (by === G.me) G.armies.forEach(a => { if (a.tgt === t) { a.at = t; a.tgt = null; } });
  // cae el territorio de origen (la capital): el país capitula y entrega el resto
  if (t === from || !G.terrOf[from].length) { [...G.terrOf[from]].forEach(x => transfer(x, by)); eliminate(from, by); }
}
function lossFn(k, f, s) { const u = G.n[k].u; for (const t of UK) if (t !== 'rifle') u[t] = Math.max(0, u[t] * (1 - f * s)); u.rifle = Math.max(0, u.rifle * (1 - f * s * .6)); }
const speedOf = (rr, t, land) => (.9 * Math.pow(Math.min(rr, 6) - 1.25, .7) + .05) / Math.pow((C[t].area || 1e4) / 1e5 + .3, .35) * (land ? 1 : .6);
function advance(x, rr, t, land) { // x avanza sobre el territorio t
  const T = G.terr[t];
  if (T.occ && T.occ.by !== x) return; // lo está ocupando otro
  if (!T.occ) T.occ = { by: x, pct: 0 };
  T.occ.pct += speedOf(rr, t, land);
  T.infra = Math.max(3, T.infra - .15); T.qol = Math.max(3, T.qol - .05); dirty = true;
  if (T.occ.pct >= 100) conquer(t, x);
}
function pushBack(x, rr, t) { const oc = G.terr[t].occ; if (!oc || oc.by !== x) return; oc.pct -= speedOf(rr, t, true) * 2; if (oc.pct <= 0) G.terr[t].occ = null; dirty = true; }
function share(k, e) { const es = enemiesOf(k).filter(x => canReach(k, x) || canReach(x, k)); const tot = es.reduce((s, x) => s + power(x), 0) || 1; return power(e) / tot; }
function fight(w) {
  if (w.a === G.me || w.b === G.me) return fightPlayer(w);
  const { a, b } = w;
  const land = landNeighbors(a).has(b);
  if (!land && !seaTarget(a, b) && !seaTarget(b, a)) { w.r = 1; w.front = false; return; }
  w.front = true;
  const sa = share(a, b), sb = share(b, a);
  const r = power(a) * sa * (land ? 1 : .5) / Math.max(1, power(b, true) * sb * 1.4); w.r = r;
  lossFn(a, Math.min(.01, .0016 * Math.pow(1 / r, .6)), sa); lossFn(b, Math.min(.01, .0016 * Math.pow(r, .6)), sb);
  const [x, y, rr] = r >= 1 ? [a, b, r] : [b, a, 1 / r];
  if (rr < 1.3) return; // guerra de trincheras: con fuerzas parejas el frente no se mueve
  const lost = (G.terrOf[x] || []).find(t => G.terr[t].occ && G.terr[t].occ.by === y);
  if (lost) return pushBack(y, rr, lost);
  const landXY = landNeighbors(x).has(y);
  const t = (G.terrOf[y] || []).find(t => G.terr[t].occ && G.terr[t].occ.by === x) ||
    (landXY ? G.terrOf[y].filter(t => C[t].adj.some(n => G.owner[n] === x)).sort((p, q) => C[p].area - C[q].area)[0] : seaTarget(x, y));
  if (t) advance(x, rr, t, landXY);
}
// guerra con el jugador: lo decide dónde están sus ejércitos
function fightPlayer(w) {
  const me = G.me, e = w.a === me ? w.b : w.a;
  const myP = power(me), myD = power(me, true), eP = power(e), eD = power(e, true), sE = share(e, me);
  const attackers = G.armies.filter(a => !a.to && a.tgt && G.owner[a.tgt] === e);
  let best = 0, front = false; w.danger = 0;
  // 1) mis ofensivas: cada ejército pelea contra la parte del enemigo que lo enfrenta
  for (const a of attackers) {
    const land = C[a.tgt].adj.includes(a.at);
    const r = myP * a.frac * (land ? 1 : .5) / Math.max(1, eD * sE * 1.4 / attackers.length);
    best = Math.max(best, r); front = true;
    lossFn(me, Math.min(.01, .0016 * Math.pow(1 / r, .6)), a.frac); lossFn(e, Math.min(.01, .0016 * Math.pow(r, .6)), sE / attackers.length);
    if (r >= 1.3) advance(me, r, a.tgt, land); else if (r < 1 / 1.3) pushBack(me, 1 / r, a.tgt);
  }
  // 2) la ofensiva enemiga: elige mi territorio peor defendido
  const landE = landNeighbors(e).has(me);
  let cands = (G.terrOf[me] || []).filter(t => C[t].adj.some(n => G.owner[n] === e));
  if (!landE) { const s = seaTarget(e, me); cands = s ? [s] : []; }
  if (cands.length) {
    front = true;
    const defAt = t => .1 + G.armies.reduce((s, a) => s + (a.to ? 0 : a.at === t ? a.frac : C[t].adj.includes(a.at) && G.owner[a.at] === me ? a.frac * .5 : 0), 0);
    const t = cands.find(t => G.terr[t].occ && G.terr[t].occ.by === e) || cands.reduce((b, x) => (defAt(x) < defAt(b) ? x : b), cands[0]);
    const local = Math.min(1, defAt(t)), r = eP * sE * .6 / Math.max(1, myD * local * 1.4);
    lossFn(e, Math.min(.01, .0016 * Math.pow(1 / r, .6)), sE * .6); lossFn(me, Math.min(.01, .0016 * Math.pow(r, .6)), local);
    if (r >= 1.3) advance(e, r, t, landE); else if (r < 1 / 1.3) pushBack(e, 1 / r, t);
    w.danger = r; w.dangerAt = t;
  }
  w.front = front;
  const adv = best || (w.danger ? 1 / w.danger : 1); // ventaja vista desde mí
  w.r = w.a === me ? adv : 1 / adv;
}

/* ======================= SIMULACIÓN ======================= */
function unitCost(k, type) { const U = UNITS[type]; return U.price * (type === 'inf' ? G.n[k].pm * ideoOf(k).rec : 1) / 1000; }
// compra: se paga con el fondo militar y espera turno en las fábricas (o en los cuarteles para soldados)
function buy(k, type, lots, dry = false) {
  const n = G.n[k], U = UNITS[type], cost = unitCost(k, type) * lots;
  if (cost > n.fund + 1e-9) return { ok: false, msg: `Falta plata en el fondo militar (cuesta ${money(cost)})` };
  let start, days;
  if (type === 'inf') {
    const cap = popOf(k) * .05, queued = G.q.filter(o => o.k === k && o.t === 'inf').reduce((s, o) => s + o.n, 0);
    if (n.u.inf + queued + U.lot * lots > cap) return { ok: false, msg: 'No hay más población para reclutar (tope: 5 %)' };
    start = Math.max(G.day, n.lineInf); days = U.lot * lots / (barracks(k) / 365);
  } else { start = Math.max(G.day, n.line); days = cost / (factory(k) / 365); }
  if (start - G.day > 540) return { ok: false, msg: type === 'inf' ? 'Los cuarteles están llenos por más de un año y medio' : 'Las fábricas están saturadas por más de un año y medio' };
  const arr = Math.round(start + Math.max(U.days, days));
  if (dry) return { ok: true, arr };
  n.fund -= cost;
  if (type === 'inf') n.lineInf = start + days; else n.line = start + days;
  G.q.push({ k, t: type, n: U.lot * lots, day: arr });
  return { ok: true, arr };
}
function spendDev(k, field, budget, costRate, mult) {
  const ts = (G.terrOf[k] || []).filter(t => G.terr[t][field] < 99.5); if (!ts.length) return;
  const n = G.n[k]; const t = ts.includes(n.prio) ? n.prio : ts.reduce((a, b) => (G.terr[b][field] < G.terr[a][field] ? b : a));
  const T = G.terr[t]; T[field] = Math.min(100, T[field] + budget * mult / Math.max(.001, T.gdp * costRate));
}
function dayTick() {
  G.day++; nbCache = null;
  for (const k of alive()) {
    const n = G.n[k], R = revenue(k) / 365, I = ideoOf(k), b = n.bud, used = (b.mil + b.infra + b.qol) / 100;
    n.fund += R * b.mil / 100 - upkeep(k) / 365;
    if (n.fund < 0) { n.treasury += n.fund; n.fund = 0; }
    n.treasury += R * Math.max(0, 1 - used);
    if (n.treasury < 0) { n.stab = Math.max(0, n.stab - .08); for (const t of UK) n.u[t] *= .9995; }
    spendDev(k, 'infra', R * b.infra / 100, .004, 1);
    spendDev(k, 'qol', R * b.qol / 100, .006, I.qolm);
    const war = warsOf(k).length > 0;
    for (const t of G.terrOf[k]) {
      const T = G.terr[t];
      T.gdp *= 1 + (.015 + .02 * (T.infra - 50) / 50 + .01 * (T.qol - 50) / 50 + I.growth - (war ? .015 : 0) - (T.occ ? .1 : 0)) / 365;
    }
    n.stab += (40 + avgQol(k) * .5 + (I.stab || 0) - warsOf(k).length * 6 - n.stab) * .004;
  }
  for (let i = G.q.length - 1; i >= 0; i--) { const o = G.q[i]; if (o.day <= G.day) { if (G.n[o.k]) G.n[o.k].u[o.t] += o.n; G.q.splice(i, 1);
    if (o.k === G.me) pushNews(`📦 Llegaron ${fmtInt(o.n)} ${UNITS[o.t].n.toLowerCase()}`, 'good'); } }
  if (G.n[G.me]) for (const a of G.armies) if (a.to && G.day >= a.arr) { a.at = a.to; a.to = null; if (a.then) { a.tgt = a.then; a.then = null; } }
  for (const w of [...G.wars]) if (G.n[w.a] && G.n[w.b] && G.wars.includes(w)) fight(w);
  G.tension = clamp(G.tension + .015, 0, 100);
  if (G.day % 30 === 0) monthTick();
  if (G.n[G.me] && G.day >= G.nextEvent) { G.nextEvent = G.day + 300 + Math.floor(Math.random() * 130); randomEvent(); }
}
function monthTick() {
  for (const t of PLAYABLE) { const T = G.terr[t]; T.infra = Math.max(3, T.infra - .15); T.qol = Math.max(3, T.qol - .2); T.pop *= 1 + (.004 + T.qol / 10000) / 12; }
  Object.keys(G.rel).forEach(k => { G.rel[k] *= .985; });
  // ayuda extranjera: llega como armamento ya fabricado (y algo de plata), cada vez menos
  for (const k of alive()) if (G.n[k].aid > 1) { const n = G.n[k], f = .05 * (n.aid - 1) / .7; if (n.u0) for (const t of UK) n.u[t] += n.u0[t] * f; n.fund += 2 * (n.aid - 1); n.aid = Math.max(1, n.aid - .01); }
  for (const k of alive()) if (k !== G.me) ai(k);
  autosave();
}
function ai(k) {
  const n = G.n[k], I = ideoOf(k), wars = warsOf(k);
  n.bud.mil = wars.length ? clamp(Math.max(n.bud.mil, 45), 0, 75) : clamp(Q[k].milPct / 12 * 100, 2, 90);
  if (n.bud.mil + n.bud.infra + n.bud.qol > 100) n.bud.qol = Math.max(0, 100 - n.bud.mil - n.bud.infra);
  // en paz se arma de a poco (más si sube la tensión); en guerra gasta casi todo
  const budget = n.fund * (wars.length ? .8 : .06 * (1 + G.tension / 50));
  if (budget > .01) {
    const mix = { inf: .25, rpg: .03, tank: .16, art: .08, mlrs: .06, air: .2, heli: .06, drone: .06, sam: .03, ship: .03 };
    // pedidos chicos y frecuentes: lo que fábricas y cuarteles entregan en ~60 días
    const cap = t => (t === 'inf' ? barracks(k) / 365 * 60 / 1000 : factory(k) / 365 * 60 / unitCost(k, t)) * (t === 'ship' ? .5 : 1);
    for (const [t, f] of Object.entries(mix)) { const lots = Math.min(Math.floor(budget * f / unitCost(k, t)), Math.floor(cap(t) * f * 2) || (t === 'ship' ? 0 : 1)); if (lots > 0) buy(k, t, lots); }
    if (n.u.rifle < n.u.inf) buy(k, 'rifle', Math.ceil((n.u.inf - n.u.rifle) / 1000));
  }
  for (const w of wars) {
    const other = w.a === k ? w.b : w.a, myR = w.a === k ? w.r : 1 / w.r;
    if (myR < .7 && G.day - w.day > 120 && Math.random() < .25) {
      if (other === G.me) askPeace(k);
      else if (1 / myR < 1 || G.day - w.day > 700) makePeace(k, other);
    }
  }
  if (wars.length >= 2 || !I.aggr) return;
  const thr = 12 + G.tension * .35, myP = power(k);
  let best = null;
  for (const o of alive()) {
    if (o === k || allied(k, o) || atWar(k, o) || !(landNeighbors(k).has(o) || seaTarget(k, o, 220))) continue;
    const r = rel(k, o); if (r > thr) continue;
    const helpers = alliesOf(o).filter(x => rel(x, o) >= 50 && x !== k).reduce((s, x) => s + power(x) * .4, 0);
    if (myP > 1.5 * (power(o, true) + helpers) && (!best || r < best[1])) best = [o, r];
  }
  if (best && Math.random() < .02 * I.aggr * (.5 + G.tension / 50)) declareWar(k, best[0]);
  if (Math.random() < .03) for (const o of landNeighbors(k)) if (o !== G.me && !allied(k, o) && rel(k, o) >= 85) { G.ally[pk(k, o)] = 1; break; }
}
function autosave() { if (G && G.n[G.me]) store(G); }

/* ======================= DECISIÓN ANUAL ======================= */
const me_ = () => G.n[G.me];
const addTre = f => { me_().treasury += revenue(G.me) * f; };
const addStab = d => { me_().stab = clamp(me_().stab + d, 0, 100); };
const addGdp = f => G.terrOf[G.me].forEach(t => (G.terr[t].gdp *= 1 + f));
const addQol = d => G.terrOf[G.me].forEach(t => (G.terr[t].qol = clamp(G.terr[t].qol + d, 3, 100)));
const addInfra = d => G.terrOf[G.me].forEach(t => (G.terr[t].infra = clamp(G.terr[t].infra + d, 3, 100)));
const addUnits = (t, f) => { me_().u[t] *= 1 + f; };
const relAll = d => alive().forEach(o => o !== G.me && addRel(G.me, o, d));
const rival = () => alive().filter(o => o !== G.me).sort((a, b) => rel(G.me, a) - rel(G.me, b))[0];
const neighborHostile = () => [...landNeighbors(G.me)].filter(o => !allied(G.me, o)).sort((a, b) => rel(G.me, a) - rel(G.me, b))[0] || rival();
const EVENTS = [
  () => ({ t: '🛢️ Descubren un yacimiento de petróleo', d: 'Geólogos encontraron una reserva enorme en el interior del país.', o: [
    ['Explotarlo a fondo', 'Tesoro +60 % de la recaudación de un año · calidad de vida −4', () => { addTre(.6); addQol(-4); }],
    ['Declararlo reserva natural', 'Estabilidad +6 · PBI +1 % por turismo', () => { addStab(6); addGdp(.01); }]] }),
  () => ({ t: '🦠 Una pandemia llega al país', d: 'Los hospitales se están llenando y la gente pide medidas.', o: [
    ['Cuarentena estricta', 'PBI −4 % · estabilidad +4', () => { addGdp(-.04); addStab(4); }],
    ['Seguir abiertos', 'Estabilidad −10 · calidad de vida −6', () => { addStab(-10); addQol(-6); }]] }),
  () => ({ t: '🎖️ Intento de golpe de Estado', d: 'Un grupo de coroneles intentó tomar la casa de gobierno. Fracasó, por ahora.', o: [
    ['Purga en el ejército', 'Soldados −8 % · estabilidad +10', () => { addUnits('inf', -.08); addStab(10); }],
    ['Amnistía y diálogo', 'Estabilidad −8 · relaciones +3 con todos', () => { addStab(-8); relAll(3); }]] }),
  () => ({ t: '📉 Crisis financiera mundial', d: 'Las bolsas se desploman y tu moneda pierde valor.', o: [
    ['Rescatar a los bancos', 'Tesoro −40 % de la recaudación anual · estabilidad +3', () => { addTre(-.4); addStab(3); }],
    ['Ajuste fiscal', 'PBI −3 % · estabilidad −7 · tesoro +20 %', () => { addGdp(-.03); addStab(-7); addTre(.2); }]] }),
  () => ({ t: '🌋 Un terremoto sacude el país', d: 'Varias ciudades quedaron dañadas.', o: [
    ['Reconstrucción total', 'Tesoro −30 % de la recaudación anual · nada se rompe', () => addTre(-.3)],
    ['Pedir ayuda internacional', 'Infraestructura −10 · relaciones +5 con todos', () => { addInfra(-10); relAll(5); }]] }),
  () => ({ t: '💸 Un multimillonario quiere donar su fortuna', d: 'A cambio pide que una autopista lleve su nombre.', o: [
    ['Aceptar', 'Tesoro +35 % · estabilidad −3', () => { addTre(.35); addStab(-3); }],
    ['Rechazar con dignidad', 'Estabilidad +4', () => addStab(4)]] }),
  () => ({ t: '🛸 Ovnis sobrevuelan la capital', d: 'Miles de personas lo filmaron. Nadie sabe qué es.', o: [
    ['Investigarlo en secreto', 'Tesoro −10 %. Puede que haya tecnología…', () => { addTre(-.1); if (Math.random() < .5) { me_().tech += .05; pushNews('🛸 ¡Los científicos copiaron tecnología! Tecnología militar +0,05', 'good'); } else pushNews('🛸 Eran globos meteorológicos', 'info'); }],
    ['Decir que eran globos', 'Nada pasa (o eso creés)', () => {}]] }),
  () => { const v = neighborHostile(); return { t: `📱 Un influencer pide invadir ${name(v)}`, d: `Tiene 40 millones de seguidores y #Invadir${name(v).replace(/\s/g, '')} es tendencia.`, o: [
    ['Hacerle caso', `Guerra contra ${name(v)} · estabilidad +8`, () => { declareWar(G.me, v); addStab(8); }],
    ['Ignorarlo', 'Estabilidad −3', () => addStab(-3)]] }; },
  () => ({ t: '☄️ Cae un meteorito en el desierto', d: 'Es del tamaño de un auto y está hecho de un metal raro.', o: [
    ['Venderlo a coleccionistas', 'Tesoro +25 %', () => addTre(.25)],
    ['Museo nacional', 'Estabilidad +5 · calidad de vida +2', () => { addStab(5); addQol(2); }]] }),
  () => ({ t: '✊ Huelga general', d: 'Los sindicatos paralizaron el país pidiendo aumentos.', o: [
    ['Dar el aumento', 'Tesoro −30 % · calidad de vida +5', () => { addTre(-.3); addQol(5); }],
    ['Reprimir', 'Estabilidad −12 · relaciones con las democracias −5', () => { addStab(-12); alive().forEach(o => G.n[o].ideo === 'dem' && o !== G.me && addRel(G.me, o, -5)); }]] }),
  () => { const r = rival(); return { t: `🕵️ Capturan a un espía de ${name(r)}`, d: 'Estaba fotografiando bases militares.', o: [
    ['Intercambiarlo en secreto', `Relación con ${name(r)} +12`, () => addRel(G.me, r, 12)],
    ['Juicio público', `Relación con ${name(r)} −15 · estabilidad +5`, () => { addRel(G.me, r, -15); addStab(5); }]] }; },
  () => ({ t: '🧳 Ola de refugiados en la frontera', d: 'Cientos de miles de personas escapan de una guerra cercana.', o: [
    ['Recibirlos', 'Población +2 % · estabilidad −4 · relaciones +4', () => { G.terrOf[G.me].forEach(t => (G.terr[t].pop *= 1.02)); addStab(-4); relAll(4); }],
    ['Cerrar la frontera', 'Relaciones con los vecinos −8', () => landNeighbors(G.me).forEach(o => addRel(G.me, o, -8))]] }),
  () => ({ t: '🔬 Avance científico nacional', d: 'Tus universidades lograron un descubrimiento clave.', o: [
    ['Uso militar', 'Tecnología militar +0,08', () => { me_().tech += .08; }],
    ['Uso civil', 'PBI +3 %', () => addGdp(.03)]] }),
  () => ({ t: '⚽ Te ofrecen organizar el Mundial', d: 'Hay que construir estadios en tiempo récord.', o: [
    ['¡Organizarlo!', 'Tesoro −35 % · estabilidad +10 · infraestructura +5', () => { addTre(-.35); addStab(10); addInfra(5); }],
    ['Rechazarlo', 'Estabilidad −2', () => addStab(-2)]] }),
  () => ({ t: '💼 Escándalo de corrupción', d: 'Filtraron audios de tu ministro de Economía pidiendo coimas.', o: [
    ['Echar a todo el gabinete', 'Estabilidad −5', () => addStab(-5)],
    ['Taparlo', '50 %: no pasa nada · 50 %: estabilidad −18', () => { if (Math.random() < .5) { addStab(-18); pushNews('📰 Se supo todo: estabilidad −18', ''); } }]] }),
  () => ({ t: '🌾 Sequía histórica', d: 'Las cosechas se perdieron y sube el precio de la comida.', o: [
    ['Importar comida', 'Tesoro −25 %', () => addTre(-.25)],
    ['Racionar', 'Estabilidad −8 · calidad de vida −4', () => { addStab(-8); addQol(-4); }]] }),
  () => { const s = pick(['us', 'ru', 'cn', 'fr', 'gb', 'tr', 'il', 'kr'].filter(x => G.n[x] && x !== G.me)) || rival(); return { t: `📦 Oferta secreta de armas de ${name(s)}`, d: 'Ofrecen 80 tanques usados a mitad de precio, entrega inmediata.', o: [
    ['Comprarlos', `Fondo militar −${money(.24)} · tanques +80`, () => { const n = me_(); if (n.fund >= .24) { n.fund -= .24; n.u.tank += 80; addRel(G.me, s, 5); } else pushNews('No alcanzó el fondo militar para pagarlos', ''); }],
    ['Rechazar', `Relación con ${name(s)} −3`, () => addRel(G.me, s, -3)]] }; },
  () => ({ t: '🫥 El presidente desapareció tres días', d: 'Volvió bronceado y dice que estaba "trabajando en un proyecto".', o: [
    ['Decir que estaba de vacaciones', 'Estabilidad −4', () => addStab(-4)],
    ['Inventar una cumbre secreta', 'Estabilidad +3 · tensión mundial +3', () => { addStab(3); G.tension = clamp(G.tension + 3, 0, 100); }]] }),
  () => { const r = rival(); return { t: `💻 Hackeo masivo desde ${name(r)}`, d: 'Se cayeron los bancos y la red eléctrica durante un día.', o: [
    ['Contraataque cibernético', `Relación con ${name(r)} −12 · tecnología +0,02`, () => { addRel(G.me, r, -12); me_().tech += .02; }],
    ['Reforzar defensas', 'Tesoro −15 %', () => addTre(-.15)]] }; },
  () => ({ t: '🗺️ Movimiento independentista', d: 'Una provincia vota en un referéndum ilegal para separarse.', o: [
    ['Dar autonomía', 'PBI −2 % · estabilidad +6', () => { addGdp(-.02); addStab(6); }],
    ['Mano dura', 'Estabilidad −10 · soldados −2 %', () => { addStab(-10); addUnits('inf', -.02); }]] }),
  () => ({ t: '🏖️ Boom turístico', d: 'Tu país se puso de moda en las redes.', o: [
    ['Invertir en hoteles y rutas', 'Infraestructura +6 · tesoro −10 %', () => { addInfra(6); addTre(-.1); }],
    ['Cobrar impuestos a los turistas', 'Tesoro +25 %', () => addTre(.25)]] }),
  () => ({ t: '🕊️ Cumbre mundial de paz', d: 'Te invitan a firmar un acuerdo para bajar la tensión.', o: [
    ['Firmarlo', 'Tensión mundial −8 · relaciones +5 con todos', () => { G.tension = clamp(G.tension - 8, 0, 100); relAll(5); }],
    ['Boicotear la cumbre', 'Tensión +5 · estabilidad +4', () => { G.tension = clamp(G.tension + 5, 0, 100); addStab(4); }]] }),
  () => ({ t: '🐧 Un pingüino ganó la intendencia de un pueblo', d: 'Fue candidato en broma y sacó el 61 % de los votos.', o: [
    ['Respetar la democracia', 'Estabilidad +5 · el mundo te mira con simpatía', () => { addStab(5); relAll(2); }],
    ['Anular la elección', 'Estabilidad −4', () => addStab(-4)]] }),
  () => ({ t: '🎵 Descubren que el himno nacional es un plagio', d: 'Un musicólogo demostró que es igual a un canto de cancha de 1912.', o: [
    ['Componer un himno nuevo', 'Tesoro −5 % · estabilidad −2', () => { addTre(-.05); addStab(-2); }],
    ['Negarlo todo', '50 %: nada · 50 %: estabilidad −8', () => { if (Math.random() < .5) addStab(-8); }]] }),
];
function randomEvent() {
  let i, tries = 0; do { i = Math.floor(Math.random() * EVENTS.length); } while (G.seen.includes(i) && tries++ < 40);
  G.seen.push(i); if (G.seen.length > EVENTS.length - 4) G.seen.shift();
  const ev = EVENTS[i](), was = speed; setSpeed(0);
  modal(`<div class="event-tag">🎲 DECISIÓN DEL AÑO · ${dateOf(G.day)}</div><h2>${ev.t}</h2><p>${ev.d}</p>
    <div class="list">${ev.o.map((o, j) => `<button class="choice" data-c="${j}"><b>${o[0]}</b>${o[1]}</button>`).join('')}</div>`, (el, close) => {
    el.querySelectorAll('[data-c]').forEach(b => (b.onclick = () => { ev.o[+b.dataset.c][2](); close(); hud(); setSpeed(was || 1); }));
  });
}

/* ======================= INTERFAZ ======================= */
let speed = 0, acc = 0, modalOpen = false, sheetFor = null, tab = 'res', dipFilter = 'all';
const dayFrac = () => (speed && !modalOpen ? clamp(acc / (700 / speed), 0, 1) : 0);
function setSpeed(s) { speed = s; document.querySelectorAll('.speeds button').forEach(b => b.classList.toggle('on', +b.dataset.sp === s)); }
document.querySelectorAll('.speeds button').forEach(b => (b.onclick = () => setSpeed(+b.dataset.sp)));
function pushNews(msg, cls = '') {
  const box = $('news'), d = document.createElement('div'); d.className = cls; d.textContent = msg; box.prepend(d);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 5500);
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2800); }
function hud() {
  const me = G.me, n = G.n[me];
  document.body.style.setProperty('--barh', document.querySelector('.bar').offsetHeight + 'px');
  $('sDate').textContent = dateOf(G.day);
  $('sTension').textContent = Math.round(G.tension) + ' %';
  if (!n) return;
  $('sTreasury').textContent = money(n.treasury); $('sFund').textContent = money(n.fund);
  $('sGdp').textContent = money(gdpOf(me)); $('sPower').textContent = fmtPow(power(me));
  $('wars').innerHTML = warsOf(me).map(w => { const e = w.a === me ? w.b : w.a, r = w.a === me ? w.r : 1 / w.r, pct = Math.round(100 * r / (1 + r));
    return `<button class="war" data-k="${e}"><img src="${flagSrc(me)}" alt=""><span class="vs">VS</span><img src="${flagSrc(e)}" alt=""><span>${name(e)}</span>
      <span class="bar2" title="Quién gana en el frente"><i style="width:${w.front ? pct : 50}%"></i></span></button>`; }).join('') +
    (G.wars.length ? `<div class="war world">🌍 ${G.wars.length} guerra${G.wars.length > 1 ? 's' : ''} en el mundo</div>` : '');
  $('wars').querySelectorAll('[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
  renderArmyBar();
}
const relLabel = r => (r >= 80 ? 'Excelente' : r >= 60 ? 'Buena' : r >= 40 ? 'Neutral' : r >= 20 ? 'Mala' : 'Hostil');
const relColor = r => (r >= 60 ? 'var(--green)' : r >= 40 ? 'var(--yellow)' : r >= 20 ? 'var(--orange)' : 'var(--red)');
const bar = (v, color) => `<div class="relbar"><i style="width:${clamp(v, 0, 100)}%;background:${color || relColor(v)}"></i></div>`;
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; }
function closeSheet() { $('sheet').hidden = true; sheetFor = null; sel = null; dirty = true; document.querySelectorAll('.dock button').forEach(b => b.classList.remove('on')); }
$('sheetClose').onclick = closeSheet;

function renderArmyBar() {
  const el = $('armyBar');
  if (!selArmy || !G || !G.n[G.me] || !G.armies.includes(selArmy)) { el.hidden = true; selArmy = null; return; }
  const a = selArmy, where = a.to ? `marchando a ${name(a.to)} (llega el ${dateOf(a.arr)})` : a.tgt ? `atacando ${name(a.tgt)} desde ${name(a.at)}` : `en ${name(a.at)}`;
  const same = G.armies.some(b => b !== a && !b.to && b.at === (a.to || a.at));
  const sig = [G.armies.indexOf(a), a.frac, a.at, a.to, a.tgt, same, Math.round(power(G.me) * a.frac / 100)].join();
  if (el.dataset.sig === sig && !el.hidden) return; // no redibujar si no cambió (evita parpadeos al tocar)
  el.dataset.sig = sig; el.hidden = false;
  el.innerHTML = `<div class="top"><b>${armyName(a)}</b><small>${Math.round(a.frac * 100)} % de tus tropas · poder ${fmtPow(power(G.me) * a.frac)} · ${where}</small></div>
    <div class="tip">👉 Tocá un territorio enemigo para atacarlo, o uno tuyo para mover el ejército.</div>
    <div class="acts"><button class="btn blue" data-x="split">DIVIDIR EN 2</button>${same ? '<button class="btn blue" data-x="merge">UNIR</button>' : ''}
      ${a.tgt || a.then ? '<button class="btn" data-x="stop">DETENER ATAQUE</button>' : ''}<button class="btn" data-x="close">LISTO</button></div>`;
  el.querySelectorAll('[data-x]').forEach(b => (b.onclick = () => {
    const x = b.dataset.x;
    if (x === 'split') splitArmy(a); if (x === 'merge') mergeArmies(a); if (x === 'stop') { a.tgt = null; a.then = null; }
    if (x === 'close') selArmy = null;
    el.dataset.sig = ''; renderArmyBar();
  }));
}

function openCountry(k) {
  const o = G.owner[k] && G.n[G.owner[k]] ? G.owner[k] : k;
  if (o === G.me) return openMe('terr', k);
  sel = o; sheetFor = o; dirty = true; document.querySelectorAll('.dock button').forEach(b => b.classList.remove('on')); renderCountry(k);
}
function renderCountry(terr) {
  const o = sheetFor, me = G.me, n = G.n[o]; if (!n) return closeSheet();
  const r = rel(me, o), war = atWar(me, o), al = allied(me, o), u = n.u, myN = G.n[me];
  const reach = myN && canReach(me, o), cost = Math.max(.05, gdpOf(me) * .0005);
  const cooldown = myN && myN.relDay[o] && G.day - myN.relDay[o] < 30;
  const T = terr && terr !== o && G.owner[terr] === o ? G.terr[terr] : null;
  const allyWars = al ? enemiesOf(o).filter(e => e !== me && !atWar(me, e)) : [];
  const ratio = myN ? power(me) / Math.max(1, power(o, true)) : 0;
  openSheet(`<div class="sh-head"><img src="${flagSrc(o)}" alt=""><div><h2>${up(name(o))}</h2>
      <p>${ideoOf(o).n}${al ? ' <span class="chip2">ALIADO</span>' : ''}${war ? ' <span class="chip2 war">EN GUERRA</span>' : ''}</p></div></div>
    ${T ? `<div class="hint">Territorio conquistado: <b>${name(terr)}</b> · infraestructura ${Math.round(T.infra)} · calidad de vida ${Math.round(T.qol)}</div>` : ''}
    <div class="sec"><h3>🤝 RELACIÓN CON ${up(name(me))}</h3><div class="slider"><span style="color:#fff">${relLabel(r)}</span><span>${r} / 100</span>${bar(r)}</div></div>
    ${myN ? `<div class="sec"><h3>⚔️ COMPARACIÓN MILITAR</h3><div class="slider"><span style="color:#fff">${ratio >= 1.5 ? 'Sos mucho más fuerte' : ratio >= 1 ? 'Sos un poco más fuerte' : ratio >= .66 ? 'Es un poco más fuerte' : 'Es mucho más fuerte'}</span><span>${ratio.toFixed(1)}×</span>${bar(100 * ratio / (1 + ratio), ratio >= 1 ? 'var(--green)' : 'var(--red)')}</div></div>` : ''}
    <div class="grid2">
      <div class="cell"><small>📈 PBI</small><b>${money(gdpOf(o))}</b></div><div class="cell"><small>👥 POBLACIÓN</small><b>${fmtInt(popOf(o) / 1e6)} M</b></div>
      <div class="cell"><small>⚔️ PODER</small><b>${fmtPow(power(o))}</b></div><div class="cell"><small>🗺️ TERRITORIOS</small><b>${G.terrOf[o].length}</b></div>
      <div class="cell"><small>🪖 SOLDADOS</small><b>${fmtInt(u.inf)}</b></div><div class="cell"><small>TANQUES</small><b>${fmtInt(u.tank)}</b></div>
      <div class="cell"><small>✈️ AVIONES</small><b>${fmtInt(u.air)}</b></div><div class="cell"><small>⚓ BUQUES</small><b>${fmtInt(u.ship)}</b></div>
    </div>
    ${enemiesOf(o).length ? `<div class="hint">En guerra con: ${enemiesOf(o).map(name).join(', ')}</div>` : ''}
    ${myN ? `<div class="acts">
      ${!war ? `<button class="btn good" data-a="rel" ${cooldown ? 'disabled' : ''}>🤝 MEJORAR RELACIÓN (${money(cost)})</button>` : ''}
      ${!war && !al ? `<button class="btn blue" data-a="ally" ${r < 70 ? 'disabled title="Necesitás 70 de relación"' : ''}>📜 PROPONER ALIANZA${r < 70 ? ' (70+)' : ''}</button>` : ''}
      ${al ? `<button class="btn" data-a="unally">ROMPER ALIANZA</button>` : ''}
      ${allyWars.length ? `<button class="btn warbtn" data-a="help">🛡️ DEFENDERLO (${allyWars.map(name).join(', ')})</button>` : ''}
      ${war ? `<button class="btn warbtn" data-a="attack">⚔️ MANDAR UN EJÉRCITO</button><button class="btn good" data-a="peace">🕊️ PROPONER PAZ</button>` : `<button class="btn warbtn" data-a="war">⚔️ DECLARAR GUERRA</button>`}
    </div>
    ${!war && !reach ? '<div class="hint">No tenés frontera ni flota suficiente para invadirlo: comprá buques de guerra.</div>' : ''}` : ''}`);
  $('sheetBody').querySelectorAll('[data-a]').forEach(b => (b.onclick = () => countryAction(b.dataset.a, o, cost, terr)));
}
function countryAction(a, o, cost, terr) {
  const me = G.me, n = G.n[me];
  if (a === 'rel') { if (n.treasury < cost) return toast('No alcanza el tesoro'); n.treasury -= cost; addRel(me, o, 6); n.relDay[o] = G.day; toast(`Relación con ${name(o)} +6`); }
  if (a === 'ally') { if (rel(me, o) >= 70 && Math.random() < (rel(me, o) - 50) / 40) { G.ally[pk(me, o)] = 1; news(`📜 ${name(o)} aceptó la alianza`, 'good', true); } else { addRel(me, o, -3); toast(`${name(o)} rechazó la alianza`); } }
  if (a === 'unally') { delete G.ally[pk(me, o)]; addRel(me, o, -20); toast('Alianza rota'); }
  if (a === 'help') { enemiesOf(o).forEach(e => { if (e !== me && !atWar(me, e)) declareWar(me, e, 2); }); addRel(me, o, 15); }
  if (a === 'war') return confirmBox(`¿Declarar la guerra a ${name(o)}?`, `Sus aliados (${alliesOf(o).filter(x => rel(x, o) >= 50).map(name).join(', ') || 'ninguno'}) pueden entrar a defenderlo y la tensión mundial sube. Después mandá un ejército: tocá su ficha en el mapa y tocá ${name(o)}.`, 'DECLARAR GUERRA', () => { declareWar(me, o); renderCountry(terr); hud(); });
  if (a === 'attack') {
    const t = terr && G.owner[terr] === o ? terr : G.terrOf[o].find(x => C[x].adj.some(y => G.owner[y] === me)) || seaTarget(me, o) || G.terrOf[o][0];
    const army = selArmy || G.armies.reduce((b, x) => (x.frac > b.frac ? x : b), G.armies[0]);
    toast(orderArmy(army, t)); selArmy = army; closeSheet(); hud(); return;
  }
  if (a === 'peace') {
    const w = G.wars.find(w => (w.a === me && w.b === o) || (w.b === me && w.a === o)), myR = w.a === me ? w.r : 1 / w.r;
    if (myR > 1.2 || (G.day - w.day > 365 && Math.random() < .4) || Math.random() < .1) makePeace(me, o); else toast(`${name(o)} rechazó la paz`);
  }
  renderCountry(terr); hud(); dirty = true;
}

const unitIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
function advice(me) {
  const n = G.n[me], out = [], R = revenue(me);
  if (n.treasury < 0) out.push(['warn', '🔴 Estás en rojo: el ejército cuesta más de lo que recaudás. Subí el % militar o recortá otros gastos.']);
  for (const w of warsOf(me)) { const e = w.a === me ? w.b : w.a;
    if ((w.danger || 0) >= 1.3) out.push(['warn', `🛡️ ${name(e)} te está invadiendo${w.dangerAt ? ' por ' + name(w.dangerAt) : ''}: mové un ejército ahí para defender.`]);
    if (!G.armies.some(a => (a.tgt || a.then) && G.owner[a.tgt || a.then] === e)) out.push(['warn', `⚔️ Estás en guerra con ${name(e)} pero ningún ejército ataca. Tocá tu ficha en el mapa y después un territorio de ${name(e)}.`]); }
  if (n.fund < unitCost(me, 'tank') * 5) out.push(['', `🎖️ Tu fondo militar es chico. Subí el % militar en 💰 PLATA para poder comprar armas (hoy te queda libre ${money(Math.max(0, R * n.bud.mil / 100 - upkeep(me)))}/año).`]);
  if (n.stab < 40) out.push(['warn', '😠 La estabilidad está baja: invertí en calidad de vida o terminá guerras.']);
  const broken = G.terrOf[me].filter(t => G.terr[t].infra < 25); if (broken.length) out.push(['', `🏚️ ${broken.map(name).join(', ')}: infraestructura destruida. Reparala en 🏙️ CIUDADES.`]);
  if (!warsOf(me).length && G.tension > 55) out.push(['', '🌡️ La tensión mundial es alta. Conseguí aliados en 🤝 DIPLOMACIA antes de que te ataquen.']);
  if (!out.length) out.push(['', '✅ Todo en orden. Pensá a quién conquistar o con quién aliarte.']);
  return out.slice(0, 4).map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
}
function openMe(t = 'res', focusTerr) {
  tab = t; sheetFor = G.me; sel = null; dirty = true;
  document.querySelectorAll('.dock button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const me = G.me, n = G.n[me]; if (!n) return;
  const tabs = [['res', '🏛️ PAÍS'], ['army', '⚔️ EJÉRCITO'], ['bud', '💰 PLATA'], ['terr', '🏙️ CIUDADES'], ['dip', '🤝 DIPLOMACIA'], ['ideo', '📜 GOBIERNO']];
  let body = '';
  if (t === 'res') {
    const rank = alive().map(k => [k, strengthScore(k)]).sort((a, b) => b[1] - a[1]).findIndex(x => x[0] === me) + 1;
    body = `<div class="gauges">
      <div class="gauge"><span class="ic">📈</span><small>ECONOMÍA</small><b>${money(gdpOf(me))}</b>${bar(100 * Math.log10(gdpOf(me) * 1000 + 1) / 7.5, 'var(--blue)')}</div>
      <div class="gauge"><span class="ic">⚔️</span><small>EJÉRCITO</small><b>${fmtPow(power(me))}</b>${bar(100 * Math.log10(power(me) + 1) / 6.6, 'var(--red)')}</div>
      <div class="gauge"><span class="ic">🙂</span><small>ESTABILIDAD</small><b>${Math.round(n.stab)} %</b>${bar(n.stab)}</div>
      <div class="gauge"><span class="ic">🏠</span><small>CALIDAD DE VIDA</small><b>${Math.round(avgQol(me))} / 100</b>${bar(avgQol(me))}</div>
    </div>
    <div class="grid2">
      <div class="cell"><small>🏆 PUESTO MUNDIAL</small><b>#${rank} de ${alive().length}</b></div><div class="cell"><small>👥 POBLACIÓN</small><b>${fmtInt(popOf(me) / 1e6)} M</b></div>
      <div class="cell"><small>💰 TESORO</small><b>${money(n.treasury)}</b></div><div class="cell"><small>🎖️ FONDO MILITAR</small><b>${money(n.fund)}</b></div>
    </div>
    <div class="sec"><h3>💡 CONSEJOS</h3><div class="advice">${advice(me)}</div></div>`;
  }
  if (t === 'bud') {
    const R = revenue(me), b = n.bud, rest = Math.max(0, 100 - b.mil - b.infra - b.qol);
    const sl = (k, label, hint) => `<label class="slider" for="b_${k}">${label}<span data-v="${k}">${b[k].toFixed(0)} % · ${money(R * b[k] / 100)}/año</span>
      <input id="b_${k}" type="range" min="0" max="100" step="1" value="${b[k]}" data-k="${k}"><span class="hint">${hint}</span></label>`;
    body = `<div class="hint">Cada año el Estado recauda <b style="color:#fff">${money(R)}</b> para repartir. Movés las barras; lo que no asignes se ahorra en el tesoro.</div>
      <div class="budbar" id="budbar"></div>
      ${sl('mil', '⚔️ Militar', `Paga el mantenimiento (${money(upkeep(me))}/año). Lo que sobra va al FONDO MILITAR para comprar armas.`)}
      ${sl('infra', '🏗️ Infraestructura', 'Rutas, energía y fábricas: hace crecer el PBI y repara lo destruido.')}
      ${sl('qol', '🏠 Calidad de vida', 'Salud, educación y vivienda: más estabilidad y población.')}
      <div class="slider">💰 Ahorro al tesoro<span data-v="rest">${rest.toFixed(0)} % · ${money(R * rest / 100)}/año</span></div>
      <button class="btn blue" data-xfer ${G.day - n.xfer < 30 || n.treasury <= 0 ? 'disabled' : ''}>Pasar 25 % del tesoro al fondo militar (${money(Math.max(0, n.treasury) * .25)}) · 1 vez por mes</button>`;
  }
  if (t === 'ideo') {
    const cd = G.day - n.ideoDay < 365;
    body = `<div class="hint">Elegí cómo se gobierna tu país. Cambiar baja la estabilidad 25 puntos y no se puede repetir por un año.${cd ? ` <b style="color:#fff">Disponible el ${dateOf(n.ideoDay + 365)}.</b>` : ''}</div>
      <div class="ideos">${Object.entries(IDEO).map(([k, I]) => `<button class="ideo ${n.ideo === k ? 'on' : ''}" data-i="${k}" ${cd && n.ideo !== k ? 'disabled' : ''}>
        <b>${I.n}${n.ideo === k ? ' · ACTUAL' : ''}</b><ul>${I.d.map(([c, x]) => `<li class="${c}">${x}</li>`).join('')}</ul></button>`).join('')}</div>`;
  }
  if (t === 'army') {
    const u = n.u, q = G.q.filter(o => o.k === me).sort((a, b) => a.day - b.day);
    const fbusy = Math.max(0, n.line - G.day), ibusy = Math.max(0, n.lineInf - G.day);
    body = `<div class="sec"><h3>🗺️ TUS EJÉRCITOS EN EL MAPA</h3><div class="list">${G.armies.map((a, i) =>
        `<button class="rel" data-army="${i}"><span>⚔️</span><span>${armyName(a)} · ${Math.round(a.frac * 100)} %</span><span class="hint">${a.to ? 'marchando' : a.tgt ? 'atacando ' + name(a.tgt) : 'en ' + name(a.at)}</span><span>›</span></button>`).join('')}</div>
      <div class="hint">Tocá un ejército (acá o su ficha en el mapa) y después tocá un territorio: enemigo para atacarlo, tuyo para moverte.</div></div>
      <div class="sec"><h3>🏭 PRODUCCIÓN</h3><div class="prod">
        <div class="row"><span>🎖️ Fondo militar</span><b>${money(n.fund)}</b></div>
        <div class="row"><span>🏭 Fábricas (${money(factory(me))}/año)</span><b>${fbusy ? 'ocupadas ' + Math.ceil(fbusy) + ' días' : 'libres'}</b></div>
        <div class="row"><span>🪖 Cuarteles (${fmtInt(barracks(me))} soldados/año)</span><b>${ibusy ? 'ocupados ' + Math.ceil(ibusy) + ' días' : 'libres'}</b></div>
      </div></div>
      <div class="sec"><h3>🛒 COMPRAR (se paga con el fondo militar)</h3><div class="ucards">${UK.map(k => {
        const U = UNITS[k], p = unitCost(me, k), b1 = buy(me, k, 1, true), b10 = buy(me, k, 10, true);
        return `<div class="uc">${unitIcon(k)}<b>${fmtInt(u[k])}</b><small>${U.n}<br>${U.desc}</small>
          <div class="price">${U.lot > 1 ? `Lote de ${fmtInt(U.lot)}: ` : ''}${money(p)}${b1.ok ? ` · llega ${dateOf(b1.arr)}` : ''}</div>
          <div class="buy"><button data-b="${k}" data-l="1" ${b1.ok ? '' : 'disabled'}>COMPRAR ×1</button><button data-b="${k}" data-l="10" ${b10.ok ? '' : 'disabled'}>×10</button></div></div>`; }).join('')}</div></div>
      ${q.length ? `<div class="sec"><h3>📦 EN CAMINO</h3><div class="units">${q.slice(0, 12).map(o => `<div><span>${UNITS[o.t].n}</span><b>${fmtInt(o.n)} · ${dateOf(o.day)}</b></div>`).join('')}</div></div>` : ''}`;
  }
  if (t === 'terr') {
    body = `<div class="hint">Lo que pongas en 🏗️ infraestructura y 🏠 calidad de vida va primero a la ciudad marcada como PRIORIDAD (si no, a la más atrasada). Lo conquistado llega roto por la guerra.</div>
      <div class="list">${G.terrOf[me].map(k => { const T = G.terr[k], c = T.gdp * .04;
        return `<div class="terr" ${focusTerr === k ? 'style="box-shadow:inset 0 0 0 2px var(--yellow)"' : ''}><img src="${flagSrc(k)}" alt=""><div><div>${name(k)}${n.prio === k ? ' <span class="chip2">PRIORIDAD</span>' : ''}${T.occ ? ' <span class="chip2 war">INVADIDO</span>' : ''}${T.infra < 25 ? ' <span class="chip2 war">DESTRUIDA</span>' : ''}</div>
          <div class="mini"><span>🏗️ ${Math.round(T.infra)}</span>${bar(T.infra)}<span>🏠 ${Math.round(T.qol)}</span>${bar(T.qol)}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px"><button data-p="${k}">${n.prio === k ? 'QUITAR' : 'PRIORIDAD'}</button><button data-r="${k}" title="+10 de infraestructura ya">REPARAR ${money(c)}</button></div></div>`; }).join('')}</div>`;
  }
  if (t === 'dip') {
    const F = { all: 'Todos', nb: 'Vecinos', al: 'Aliados', war: 'En guerra', bad: 'Hostiles' };
    let list = alive().filter(o => o !== me);
    if (dipFilter === 'nb') list = list.filter(o => landNeighbors(me).has(o));
    if (dipFilter === 'al') list = list.filter(o => allied(me, o));
    if (dipFilter === 'war') list = list.filter(o => atWar(me, o));
    if (dipFilter === 'bad') list = list.filter(o => rel(me, o) < 30);
    list.sort((a, b) => rel(me, b) - rel(me, a));
    body = `<div class="filters">${Object.entries(F).map(([k, l]) => `<button data-f="${k}" class="${dipFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="list">${list.map(o => { const r = rel(me, o);
      return `<button class="rel" data-k="${o}"><img src="${flagSrc(o)}" alt=""><span>${name(o)}${allied(me, o) ? ' <span class="chip2">ALIADO</span>' : ''}${atWar(me, o) ? ' <span class="chip2 war">GUERRA</span>' : ''}</span>${bar(r)}<span>${r}</span></button>`; }).join('') || '<div class="hint">Nadie en esta lista.</div>'}</div>`;
  }
  const keepScroll = $('sheet').hidden ? 0 : $('sheet').scrollTop, sameTab = !$('sheet').hidden && sheetFor === me && $('sheetBody').dataset.tab === t;
  openSheet(`<div class="sh-head"><img src="${flagSrc(me)}" alt=""><div><h2>${up(name(me))}</h2><p>${ideoOf(me).n} · ${G.terrOf[me].length} territorio${G.terrOf[me].length > 1 ? 's' : ''}</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="sec">${body}</div>`);
  $('sheetBody').dataset.tab = t; if (sameTab) $('sheet').scrollTop = keepScroll;
  const sb = $('sheetBody');
  sb.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => openMe(b.dataset.t)));
  sb.querySelectorAll('button[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
  sb.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { dipFilter = b.dataset.f; openMe('dip'); }));
  sb.querySelectorAll('[data-army]').forEach(b => (b.onclick = () => { selArmy = G.armies[+b.dataset.army]; closeSheet(); renderArmyBar(); flyTo(bbGrow(terrBB(selArmy.to || selArmy.at), 1.5), 1.2); }));
  const budbar = () => { const el = sb.querySelector('#budbar'); if (!el) return; const b = n.bud, rest = Math.max(0, 100 - b.mil - b.infra - b.qol);
    el.innerHTML = [[b.mil, '#c0392b', 'MILITAR'], [b.infra, '#2f6fb0', 'INFRA'], [b.qol, '#1f8a52', 'VIDA'], [rest, '#8a6d1c', 'AHORRO']].map(([v, c, l]) => `<i style="flex-grow:${v};background:${c}">${v >= 12 ? l : ''}</i>`).join(''); };
  budbar();
  sb.querySelectorAll('input[data-k]').forEach(inp => (inp.oninput = () => {
    const k = inp.dataset.k, others = ['mil', 'infra', 'qol'].filter(x => x !== k);
    n.bud[k] = Math.min(+inp.value, 100 - others.reduce((s, x) => s + n.bud[x], 0)); inp.value = n.bud[k];
    sb.querySelector(`[data-v="${k}"]`).textContent = `${n.bud[k].toFixed(0)} % · ${money(revenue(me) * n.bud[k] / 100)}/año`;
    const rest = Math.max(0, 100 - n.bud.mil - n.bud.infra - n.bud.qol); sb.querySelector('[data-v="rest"]').textContent = `${rest.toFixed(0)} % · ${money(revenue(me) * rest / 100)}/año`;
    budbar();
  }));
  const xf = sb.querySelector('[data-xfer]'); if (xf) xf.onclick = () => { const v = Math.max(0, n.treasury) * .25; n.treasury -= v; n.fund += v; n.xfer = G.day; toast(`${money(v)} pasaron al fondo militar`); openMe('bud'); hud(); };
  sb.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => {
    const k = b.dataset.i; if (k === n.ideo) return;
    confirmBox(`¿Cambiar a ${IDEO[k].n}?`, 'La estabilidad baja 25 puntos y no podés volver a cambiar por un año.', 'CAMBIAR', () => {
      n.ideo = k; n.ideoDay = G.day; n.stab = Math.max(0, n.stab - 25); news(`📜 ${name(me)} adoptó: ${IDEO[k].n}`, 'info', true); openMe('ideo'); });
  }));
  sb.querySelectorAll('[data-b]').forEach(b => (b.onclick = () => {
    const r = buy(me, b.dataset.b, +b.dataset.l);
    if (r.ok) { toast(`Pedido: ${UNITS[b.dataset.b].n} ×${b.dataset.l} · llega el ${dateOf(r.arr)}`); openMe('army'); hud(); } else toast(r.msg);
  }));
  sb.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => { n.prio = n.prio === b.dataset.p ? null : b.dataset.p; openMe('terr'); }));
  sb.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => {
    const T = G.terr[b.dataset.r], c = T.gdp * .04; if (n.treasury < c) return toast('No alcanza el tesoro');
    n.treasury -= c; T.infra = Math.min(100, T.infra + 10); openMe('terr'); hud();
  }));
}
$('btnMe').onclick = () => openMe('res');
document.querySelectorAll('.dock button').forEach(b => (b.onclick = () => {
  if (!G || !G.n[G.me]) return;
  if (!$('sheet').hidden && sheetFor === G.me && tab === b.dataset.tab) closeSheet(); else openMe(b.dataset.tab);
}));

/* modales */
const modalQ = [];
function modal(html, wire) { modalQ.push([html, wire]); if (!modalOpen) nextModal(); }
function nextModal() {
  const m = modalQ.shift(); if (!m) { modalOpen = false; $('modal').hidden = true; return; }
  modalOpen = true; $('modal').hidden = false; $('modalBody').innerHTML = m[0];
  m[1]($('modalBody'), () => nextModal());
}
function confirmBox(title, text, ok, fn) {
  modal(`<h2>${title}</h2><p>${text}</p><div class="acts"><button class="btn" data-x>CANCELAR</button><button class="btn primary" data-ok>${ok}</button></div>`,
    (el, close) => { el.querySelector('[data-x]').onclick = close; el.querySelector('[data-ok]').onclick = () => { close(); fn(); }; });
}
function askHelp(ally, aggressor) {
  modal(`<div class="event-tag">ALIADO EN PELIGRO</div><h2>🛡️ ${name(ally)} pide ayuda</h2><p><b>${name(aggressor)}</b> invadió a tu aliado <b>${name(ally)}</b>. ¿Entrás en la guerra para defenderlo?</p>
    <div class="acts"><button class="btn" data-no>NO INTERVENIR</button><button class="btn warbtn" data-yes>DEFENDERLO</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = () => { addRel(G.me, ally, -25); close(); };
    el.querySelector('[data-yes]').onclick = () => { declareWar(G.me, aggressor, 2); addRel(G.me, ally, 15); close(); hud(); };
  });
}
function askPeace(k) {
  modal(`<h2>🕊️ ${name(k)} propone la paz</h2><p>Si aceptás, se levantan las ocupaciones en curso entre los dos países (lo ya conquistado queda como está).</p>
    <div class="acts"><button class="btn" data-no>SEGUIR LA GUERRA</button><button class="btn good" data-yes>ACEPTAR LA PAZ</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = close; el.querySelector('[data-yes]').onclick = () => { makePeace(G.me, k); close(); hud(); };
  });
}
function showDefeat(by) {
  store(null);
  modal(`<img src="${flagSrc(by)}" alt="" style="width:120px;border-radius:8px"><h2>${up(name(by))} TE CONQUISTÓ</h2><p>Duraste hasta el ${dateOf(G.day)}.</p>
    <div class="acts"><button class="btn" data-w>SEGUIR MIRANDO</button><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, (el, close) => {
    el.querySelector('[data-w]').onclick = close; el.querySelector('[data-n]').onclick = () => { leaving = true; location.reload(); };
  });
}
function showVictory(w) {
  store(null);
  modal(`<img src="${flagSrc(w)}" alt="" style="width:140px;border-radius:8px"><h2>${w === G.me ? '¡DOMINASTE EL MUNDO!' : `¡${up(name(w))} DOMINA EL MUNDO!`}</h2>
    <p>${dateOf(G.day)} · ${G.terrOf[w].length} territorios.</p><div class="acts"><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, el => {
    el.querySelector('[data-n]').onclick = () => { leaving = true; location.reload(); };
  });
}
function showHelp() {
  const was = speed; setSpeed(0);
  modal(`<h2>CÓMO SE JUEGA</h2><div class="steps">
    <div><span>⏱️</span>El tiempo corre solo. Arriba a la derecha pausás (❚❚) o acelerás (1× a 8×).</div>
    <div><span>⚔️</span>Tus ejércitos son las fichas doradas del mapa. Tocá una y después tocá un territorio: <b>enemigo</b> para atacarlo, <b>tuyo</b> para moverte. Con DIVIDIR atacás varios frentes; la frontera que dejes sin ejército es por donde te invaden.</div>
    <div><span>💰</span>En PLATA repartís la recaudación. El % militar paga el ejército y lo que sobra va al fondo militar, que es la única plata para comprar armas.</div>
    <div><span>🏭</span>En EJÉRCITO comprás tanques, aviones, fusiles… pero tus fábricas producen un máximo por año según tu PBI (el doble en guerra).</div>
    <div><span>🤝</span>Tocá cualquier país del mapa para mejorar la relación, aliarte, declararle la guerra o pedir la paz. Tus aliados te pueden pedir ayuda.</div>
    <div><span>🏙️</span>Lo conquistado llega destruido: reconstruilo en CIUDADES. En GOBIERNO elegís la ideología.</div>
    <div><span>🎲</span>Una vez por año vas a tener que tomar una decisión importante.</div>
    <div><span>🏆</span>Gana el último país en pie. Si cae tu capital, perdés.</div></div>
    <div class="acts"><button class="btn primary" data-ok>ENTENDIDO</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = () => { close(); setSpeed(was); }; });
}
$('btnHelp').onclick = showHelp;
let leaving = false;
function openMenu() {
  if (modalOpen) return;
  const was = speed; setSpeed(0);
  modal(`<h2>MENÚ</h2><p>La partida se guarda sola cada mes de juego.</p><div class="acts" style="flex-direction:column">
    <button class="btn primary" data-c>SEGUIR JUGANDO</button><button class="btn" data-h>CÓMO SE JUEGA</button><button class="btn" data-s>GUARDAR AHORA</button><button class="btn" data-m>SALIR AL MENÚ PRINCIPAL</button></div>`, (el, close) => {
    el.querySelector('[data-c]').onclick = () => { close(); setSpeed(was || 1); };
    el.querySelector('[data-h]').onclick = () => { close(); showHelp(); };
    el.querySelector('[data-s]').onclick = () => { autosave(); toast('Partida guardada'); };
    el.querySelector('[data-m]').onclick = () => { autosave(); leaving = true; location.href = 'index.html'; };
  });
}
$('btnMenu').onclick = openMenu;

/* ======================= ELEGIR PAÍS ======================= */
let RANK = [], FACT = {};
function difficulty(i) { return i < 12 ? [0, 'FÁCIL'] : i < 40 ? [1, 'NORMAL'] : i < 100 ? [2, 'DIFÍCIL'] : [3, 'MUY DIFÍCIL']; }
function setupPick() {
  const tmp = G; G = newGame(PLAYABLE[0]);
  RANK = PLAYABLE.map(k => [k, strengthScore(k)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const parts = {}; PLAYABLE.forEach(k => (parts[k] = strengthParts(k)));
  const mP = Math.max(...PLAYABLE.map(k => parts[k].P)), mG = Math.max(...PLAYABLE.map(k => parts[k].gdp)), mA = Math.max(...PLAYABLE.map(k => parts[k].allies)) || 1;
  PLAYABLE.forEach(k => { const s = parts[k];
    FACT[k] = { mil: 100 * Math.log10(s.P + 1) / Math.log10(mP + 1), eco: 100 * Math.log10(s.gdp * 1000 + 1) / Math.log10(mG * 1000 + 1), qol: s.qol,
      al: s.allies ? 100 * Math.log10(s.allies + 1) / Math.log10(mA + 1) : 0, th: s.threat ? clamp(100 * Math.log10(1 + s.threat / (s.P + 1)) / 1.5, 3, 100) : 0 }; });
  G = tmp;
  const list = $('pickList');
  const draw = () => {
    const q = $('pickSearch').value.trim().toLowerCase();
    list.innerHTML = RANK.map((k, i) => [k, i]).filter(([k]) => !q || name(k).toLowerCase().includes(q)).map(([k, i]) => { const [d, l] = difficulty(i);
      return `<button class="prow ${pickSel === k ? 'on' : ''}" data-k="${k}" role="option"><span class="rk">#${i + 1}</span><img src="${flagSrc(k)}" alt=""><span>${name(k)}</span><span class="diff d${d}">${l}</span></button>`; }).join('');
    list.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => choose(b.dataset.k)));
  };
  $('pickSearch').oninput = draw; draw(); pickDraw = draw;
  const s = loadSave(); $('btnLoad').hidden = !s;
  $('btnLoad').onclick = () => { G = s; startGame(); };
  $('btnStart').onclick = () => { G = newGame(pickSel); startGame(); };
}
let pickDraw = () => {};
function choose(k) {
  pickSel = k; $('btnStart').disabled = false; pickDraw();
  const i = RANK.indexOf(k), [d, l] = difficulty(i), q = Q[k], f = FACT[k];
  $('pickInfo').innerHTML = `<b style="color:#fff">${name(k)}</b> · ${IDEO[IDEO0[k] || 'dem'].n} · puesto #${i + 1} · <span class="diff d${d}">${l}</span>
    <div class="factors">
      <span>⚔️ Ejército</span>${bar(f.mil, 'var(--red)')}<span>${fmtInt(q.mil[0] * 1000)} sold.</span>
      <span>📈 Economía</span>${bar(f.eco, 'var(--blue)')}<span>${money(q.gdp)}</span>
      <span>🏠 Calidad de vida</span>${bar(f.qol)}<span>${Math.round(f.qol)}/100</span>
      <span>🤝 Aliados</span>${bar(f.al, 'var(--green)')}<span>${f.al ? 'sí' : 'ninguno'}</span>
      <span>☠️ Amenazas</span>${bar(f.th, 'var(--red)')}<span>${f.th > 60 ? 'altas' : f.th > 25 ? 'medias' : f.th ? 'bajas' : 'ninguna'}</span>
    </div>`;
  const el = $('pickList').querySelector(`[data-k="${k}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  flyTo(terrBB(k), 3); dirty = true;
}
function startGame() {
  $('pick').hidden = true; $('hud').hidden = false;
  $('meFlag').src = flagSrc(G.me); $('meName').textContent = name(G.me);
  Object.keys(ownCache).forEach(k => delete ownCache[k]); borderPath = null; nbCache = null;
  if (!G.n[G.me]) showDefeat(G.dead || alive()[0]); else flyTo(bbGrow(ownerParts(G.me).bb, .6), 1.2);
  hud(); setSpeed(0);
  // el gesto de "atrás" del celular abre el menú en vez de sacarte del juego
  history.pushState({ game: 1 }, '');
  addEventListener('popstate', () => { if (leaving) return; history.pushState({ game: 1 }, ''); openMenu(); });
  if (G.day === 0) modal(`<h2>${up(name(G.me))}</h2><p>1 de enero de 2027. La guerra de Rusia en Ucrania sigue abierta y la tensión mundial crece cada día. Construí tu imperio: manejá la plata, armá tu ejército, hacé aliados o invadí a tus vecinos. Gana el último país en pie.</p>
    <div class="steps"><div><span>⚔️</span>Tu ejército es la ficha dorada del mapa. Tocala y después tocá un territorio enemigo para atacarlo.</div>
    <div><span>👇</span>Abajo tenés todo: PAÍS, EJÉRCITO, PLATA, CIUDADES, DIPLOMACIA y GOBIERNO.</div>
    <div><span>❓</span>Si te perdés, tocá el botón ? de arriba.</div></div>
    <div class="acts"><button class="btn primary" data-ok>EMPEZAR</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = () => { close(); setSpeed(1); }; });
}

/* ======================= ENTRADA (arrastrar, zoom, tocar) ======================= */
const ptrs = new Map(); let drag = null, moved = 0;
mapCv.addEventListener('pointerdown', e => { mapCv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
  drag = { x: cam.x, y: cam.y, sx: e.clientX, sy: e.clientY, s: cam.s, d: null }; anim = null; });
mapCv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  const P = [...ptrs.values()];
  if (P.length === 2) { const d = wdist(P[0], P[1]); if (!drag.d) { drag.d = d; drag.s = cam.s; } cam.s = drag.s * d / drag.d; moved = 99; clampCam(); return; }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; moved = Math.max(moved, Math.hypot(dx, dy));
  if (moved > 6) { mapCv.classList.add('dragging'); cam.x = drag.x - dx / cam.s; cam.y = drag.y - dy / cam.s; clampCam(); }
});
function tap(x, y) {
  if (!G) { const k = hitTest(x, y); if (k) choose(k); return; }
  const tok = [...tokens].reverse().find(t => x >= t.x - 6 && x <= t.x + t.w + 6 && y >= t.y - 6 && y <= t.y + t.h + 6);
  if (tok) { selArmy = selArmy === tok.a ? null : tok.a; closeSheet(); renderArmyBar(); return; }
  const k = hitTest(x, y); if (!k) { if (selArmy) { selArmy = null; renderArmyBar(); } return; }
  if (selArmy && G.n[G.me]) { toast(orderArmy(selArmy, k)); $('armyBar').dataset.sig = ''; renderArmyBar(); return; }
  openCountry(k);
}
const endPtr = e => {
  ptrs.delete(e.pointerId); mapCv.classList.remove('dragging');
  if (ptrs.size === 0 && moved <= 6 && e.type === 'pointerup') tap(e.clientX, e.clientY);
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: cam.x, y: cam.y, sx: p[0], sy: p[1], s: cam.s, d: null }; }
};
mapCv.addEventListener('pointerup', endPtr); mapCv.addEventListener('pointercancel', endPtr);
mapCv.addEventListener('wheel', e => {
  e.preventDefault(); anim = null;
  const f = Math.exp(-e.deltaY * .0015), wx = cam.x + (e.clientX - vw / 2) / cam.s, wy = cam.y + (e.clientY - vh / 2) / cam.s;
  cam.s *= f; clampCam(); cam.x = wx - (e.clientX - vw / 2) / cam.s; cam.y = wy - (e.clientY - vh / 2) / cam.s; clampCam();
}, { passive: false });
// sin zoom del navegador por doble toque ni pellizco (iOS ignora user-scalable=no)
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
let lastTouch = 0;
document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTouch < 350 && !e.target.closest('input')) e.preventDefault(); lastTouch = now; }, { passive: false });
addEventListener('keydown', e => { if (G && e.code === 'Space' && !modalOpen && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpeed(speed ? 0 : 1); } });

/* ======================= BUCLE ======================= */
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(250, now - last); last = now;
  if (anim && !anim(now)) anim = null;
  if (G && (G.n[G.me] || G.dead)) {
    if (speed && !modalOpen) {
      acc += dt; const per = 700 / speed; let n = 0;
      while (acc >= per && n++ < 6) { acc -= per; dayTick(); }
      if (now - hudT > 300) { hudT = now; hud();
        if (!$('sheet').hidden && sheetFor && (sheetFor !== G.me || tab === 'res' || tab === 'army')) { if (sheetFor === G.me) openMe(tab); else if (G.n[sheetFor]) renderCountry(); } }
    } else acc = 0;
  }
  render(now);
  requestAnimationFrame(frame);
}
resize(); setupPick();
loadFlags().then(() => (dirty = true));
requestAnimationFrame(frame);

console.assert(relBase('ar', 'uy') >= 90 && relBase('us', 've') <= 25, 'relaciones de partida');
window.__conq = { get G() { return G; }, set G(v) { G = v; }, power, rel, dayTick, declareWar, gdpOf, upkeep, revenue, newGame, strengthScore, buy, orderArmy, randomEvent, EVENTS, get armies() { return G.armies; } };
})();
