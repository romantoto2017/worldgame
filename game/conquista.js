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
// dinero en miles de millones de USD (B$)
function money(b) {
  const m = b * 1000, s = m < 0 ? '-' : ''; const a = Math.abs(m);
  if (a >= 1e6) return `${s}US$ ${(a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} bill.`;
  if (a >= 1000) return `${s}US$ ${(a / 1000).toLocaleString('es-AR', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })} mil M`;
  return `${s}US$ ${a.toLocaleString('es-AR', { maximumFractionDigits: a >= 10 ? 0 : 1 })} M`;
}
const fmtPow = p => fmtInt(p / 100);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dateOf = d => { const t = new Date(Date.UTC(2027, 0, 1) + d * 864e5); return `${t.getUTCDate()} ${MESES[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };

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

const mapCv = $('map'), ctx = mapCv.getContext('2d'), hitCtx = document.createElement('canvas').getContext('2d');
let vw = 0, vh = 0, dpr = 1, dirty = true;
const cam = { x: W / 2, y: H / 2, s: 1 };
const minS = () => Math.min(vw / W, vh / H) * 0.95;
function clampCam() {
  cam.s = clamp(cam.s, minS(), minS() * 80);
  cam.x = clamp(cam.x, 0, W); cam.y = clamp(cam.y, 0, H); dirty = true;
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
  mapCv.width = Math.round(vw * dpr); mapCv.height = Math.round(vh * dpr);
  if (!cam.init) { cam.s = Math.min(vw / W, vh / H) * 1.1; cam.init = true; }
  clampCam();
}
addEventListener('resize', resize);
function flyTo(bb, pad = 1.6) {
  const w = Math.max(bb[2] - bb[0], 20), h = Math.max(bb[3] - bb[1], 20);
  const tgt = { s: clamp(Math.min(vw / (w * pad), vh / (h * pad)), minS(), minS() * 30), x: (bb[0] + bb[2]) / 2, y: (bb[1] + bb[3]) / 2 };
  const a = { ...cam }, t0 = performance.now();
  anim = now => { const k = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - k, 3);
    cam.s = Math.exp(Math.log(a.s) + (Math.log(tgt.s) - Math.log(a.s)) * e); cam.x = a.x + (tgt.x - a.x) * e; cam.y = a.y + (tgt.y - a.y) * e; dirty = true; return k < 1; };
}
let anim = null;

// geometría fusionada por dueño
const ownCache = {};
function ownerParts(o) {
  if (ownCache[o]) return ownCache[o];
  const regs = G.terrOf[o] || [];
  const parts = regs.length === 1 ? RP[regs[0]] : partsOf(topojson.merge(topo, regs.map(r => geomBy[r]))).sort((a, b) => b.size - a.size);
  let bb = parts.length ? parts[0].bb : [0, 0, 1, 1]; const near = parts.length ? bbGrowF(parts[0].bb, 1) : bb;
  parts.forEach(p => { if (p.bb[0] < near[2] && p.bb[2] > near[0] && p.bb[1] < near[3] && p.bb[3] > near[1]) bb = bbUnion(bb, p.bb); });
  return (ownCache[o] = { parts, bb });
}
function bbGrowF(b, f) { const w = (b[2] - b[0]) * f, h = (b[3] - b[1]) * f; return [b[0] - w, b[1] - h, b[2] + w, b[3] + h]; }
let borderPath = null;
function invalidateOwners(...os) { os.forEach(o => delete ownCache[o]); borderPath = null; dirty = true; }

function setT(c) { const k = cam.s * dpr; c.setTransform(k, 0, 0, k, (vw / 2 - cam.x * cam.s) * dpr, (vh / 2 - cam.y * cam.s) * dpr); }
function drawFlag(o, parts, x0, y0, x1, y1) {
  for (const p of parts) {
    const b = p.bb; if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    const sw = (b[2] - b[0]) * cam.s; if (sw < 0.6 && (b[3] - b[1]) * cam.s < 0.6) continue;
    const img = sw > 260 ? midFlag(o) : flagLo[o];
    ctx.save(); ctx.clip(p.path); if (img) ctx.drawImage(img, ...flagRect(b, p.c, o)); else { ctx.fillStyle = '#555'; ctx.fill(p.path); } ctx.restore();
  }
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#101a27'; ctx.fillRect(0, 0, mapCv.width, mapCv.height);
  setT(ctx);
  const x0 = cam.x - vw / 2 / cam.s, x1 = cam.x + vw / 2 / cam.s, y0 = cam.y - vh / 2 / cam.s, y1 = cam.y + vh / 2 / cam.s;
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1 / cam.s; ctx.beginPath();
  const step = W / 40;
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.fillStyle = '#3a4352'; ctx.fill(grayPath);
  if (!G) { // antes de elegir: cada país con su bandera
    PLAYABLE.forEach(k => drawFlag(k, RP[k], x0, y0, x1, y1));
    ctx.strokeStyle = 'rgba(8,12,20,.55)'; ctx.lineWidth = .9 / cam.s; PLAYABLE.forEach(k => RP[k].forEach(p => ctx.stroke(p.path)));
    if (pickSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4 / cam.s; RP[pickSel].forEach(p => ctx.stroke(p.path)); }
    return;
  }
  const owners = alive();
  owners.forEach(o => drawFlag(o, ownerParts(o).parts, x0, y0, x1, y1));
  if (!borderPath) { borderPath = new Path2D(); owners.forEach(o => ownerParts(o).parts.forEach(p => borderPath.addPath(p.path))); }
  ctx.strokeStyle = 'rgba(8,12,20,.6)'; ctx.lineWidth = .9 / cam.s; ctx.stroke(borderPath);
  // ocupaciones: la bandera del invasor avanza desde su lado como un frente
  for (const t of PLAYABLE) {
    const oc = G.terr[t].occ; if (!oc || oc.pct <= 0) continue;
    const o = oc.by; if (!G.n[o]) continue;
    const bb = RP[t].reduce((a, p) => bbUnion(a, p.bb), RP[t][0].bb);
    const from = homeC(G.terrOf[o] && G.terrOf[o].includes(o) ? o : G.terrOf[o][0]);
    const org = [clamp(from[0], bb[0], bb[2]), clamp(from[1], bb[1], bb[3])];
    const maxR = Math.max(...[[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(p => wdist(p, org)));
    const r = maxR * oc.pct / 100;
    for (const p of RP[t]) {
      ctx.save(); ctx.clip(p.path); ctx.beginPath(); ctx.arc(org[0], org[1], r, 0, 7); ctx.clip();
      const img = flagLo[o]; if (img) ctx.drawImage(img, ...flagRect(bb, bbCenter(bb), o)); ctx.restore();
    }
    ctx.save(); RP[t].forEach(p => ctx.clip(p.path)); ctx.beginPath(); ctx.arc(org[0], org[1], r, 0, 7);
    ctx.setLineDash([6 / cam.s, 4 / cam.s]); ctx.strokeStyle = '#ff3d3d'; ctx.lineWidth = 2.2 / cam.s; ctx.stroke(); ctx.restore();
  }
  // territorios en disputa: borde rojo
  ctx.lineWidth = 1.6 / cam.s; ctx.strokeStyle = 'rgba(255,61,61,.9)';
  for (const t of PLAYABLE) if (G.terr[t].occ) RP[t].forEach(p => ctx.stroke(p.path));
  // mi imperio: borde dorado; selección: blanco
  if (G.n[G.me]) { ctx.strokeStyle = '#ffc83a'; ctx.lineWidth = 2 / cam.s; ownerParts(G.me).parts.forEach(p => ctx.stroke(p.path)); }
  if (sel && G.n[sel]) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.6 / cam.s; ownerParts(sel).parts.forEach(p => ctx.stroke(p.path)); }
  // microestados: punto con bandera
  for (const o of owners) {
    const f = ownerParts(o).bb; if ((f[2] - f[0]) * cam.s > 7 || (f[3] - f[1]) * cam.s > 7) continue;
    const [cx, cy] = bbCenter(f), r = (o === G.me ? 6 : 3.6) / cam.s;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    if (flagLo[o]) ctx.drawImage(flagLo[o], ...flagRect([cx - r, cy - r, cx + r, cy + r], [cx, cy], o)); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.strokeStyle = o === G.me ? '#ffc83a' : 'rgba(255,255,255,.85)'; ctx.lineWidth = 1 / cam.s; ctx.stroke();
  }
}
function hitTest(sx, sy) {
  const wx = cam.x + (sx - vw / 2) / cam.s, wy = cam.y + (sy - vh / 2) / cam.s;
  for (const k of PLAYABLE) for (const p of RP[k]) {
    const b = p.bb; if (wx < b[0] || wx > b[2] || wy < b[1] || wy > b[3]) continue;
    if (hitCtx.isPointInPath(p.path, wx, wy)) return k;
  }
  // microestados: tocar cerca del punto
  let best = null, bd = 12 / cam.s;
  for (const k of PLAYABLE) { const d = wdist(homeC(k), [wx, wy]); if (d < bd) { bd = d; best = k; } }
  return best;
}

/* ======================= REGLAS ======================= */
// armamento: precio en millones de USD por lote, días de entrega, poder por unidad
const UNITS = {
  inf: { n: 'Soldados', lot: 1000, price: 30, days: 30, pow: 1, desc: 'Reclutamiento y entrenamiento de 1.000 soldados' },
  rifle: { n: 'Fusiles AK-47', lot: 1000, price: 0.6, days: 7, pow: 0, desc: 'Equipa a 1.000 soldados (sin fusil rinden 25 %)' },
  rpg: { n: 'Lanzacohetes RPG-7', lot: 100, price: 1.2, days: 10, pow: 4, desc: '100 lanzacohetes antitanque portátiles' },
  tank: { n: 'Tanque de batalla', lot: 1, price: 6, days: 60, pow: 60, desc: 'Blindado principal' },
  art: { n: 'Artillería autopropulsada', lot: 1, price: 3, days: 45, pow: 30, desc: 'Obús de 155 mm' },
  mlrs: { n: 'Lanzacohetes múltiple', lot: 1, price: 5, days: 60, pow: 50, desc: 'Sistema de cohetes de saturación' },
  air: { n: 'Avión de combate', lot: 1, price: 70, days: 180, pow: 200, desc: 'Caza polivalente' },
  heli: { n: 'Helicóptero de ataque', lot: 1, price: 30, days: 120, pow: 70, desc: 'Apoyo aéreo cercano' },
  drone: { n: 'Drones de ataque', lot: 10, price: 20, days: 20, pow: 20, desc: '10 drones kamikaze/armados' },
  sam: { n: 'Defensa antiaérea', lot: 1, price: 50, days: 90, pow: 60, desc: 'Batería de misiles (solo defensa)' },
  ship: { n: 'Buque de guerra', lot: 1, price: 600, days: 365, pow: 50, desc: 'Fragata/destructor: permite invadir por mar' },
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
// relaciones históricas (valor fijo de partida)
const SPECIAL = 'us-ve 20,us-ir 8,us-kp 5,us-cu 25,us-ru 18,us-cn 30,ru-ua 0,il-ir 0,in-pk 10,cn-tw 8,kp-kr 5,am-az 10,sa-ir 20,ma-dz 22,gr-tr 42,' +
  'cn-in 30,cn-jp 28,ru-pl 15,ru-lt 15,ru-lv 15,ru-ee 15,ru-ge 15,il-sy 5,il-lb 10,et-er 20,sd-ss 25,ve-co 35,ve-gy 18,rs-xk 10,ru-gb 15,ir-gb 20,' +
  'ye-sa 12,pk-af 25,kh-th 40,jp-kp 5,jp-kr 62,us-gb 95,us-il 90,us-ca 95,us-jp 88,us-kr 90,us-au 95,ru-by 95,ru-cn 75,cn-kp 80,cn-pk 90,us-tw 80,' +
  'ru-ir 70,ru-sy 80,ve-cu 92,ru-ve 70,ru-kp 78,us-mx 70,us-ph 80,fr-de 92,ar-gb 30,ar-uy 96,ar-br 88,ar-cl 85,us-sa 70,ir-sy 85,ua-pl 85,cn-ph 25,cn-vn 40';
const SP = {}; SPECIAL.split(',').forEach(s => { const [p, v] = s.split(' '); SP[p] = +v; SP[p.split('-').reverse().join('-')] = +v; });
const ALLY0 = [];
const pairs = l => { const a = l.split(' ').filter(k => Q[k]); a.forEach((x, i) => a.slice(i + 1).forEach(y => ALLY0.push([x, y]))); };
pairs(BLOCS.OTAN); pairs(BLOCS.OTSC); pairs(BLOCS.CCG); pairs('ve cu ni');
['jp', 'kr', 'au', 'ph', 'il', 'tw', 'nz'].forEach(k => ALLY0.push(['us', k])); ALLY0.push(['ru', 'kp'], ['cn', 'kp'], ['ru', 'by'], ['cn', 'pk'], ['ru', 'sy']);
const pk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/* ======================= ESTADO ======================= */
let G = null, sel = null, pickSel = null;
const alive = () => Object.keys(G.n);
const SAVE = 'empire.conq';
const store = v => { try { v == null ? localStorage.removeItem(SAVE) : localStorage.setItem(SAVE, JSON.stringify(v)); } catch {} };
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } };

function gdppc(k) { return Q[k].gdp * 1e9 / Math.max(1, Q[k].pop); }
function initialUnits(k) {
  const [per, tank, air, art, heli, ship] = Q[k].mil, inf = per * 1000;
  return { inf, rifle: inf, rpg: Math.round(inf / 40), tank, art: Math.round(art * .7), mlrs: Math.round(art * .3), air, heli, drone: air * 2, sam: Math.round(air * .2), ship };
}
function newGame(me) {
  const g = { v: 1, me, day: 0, tension: 25, n: {}, terr: {}, owner: {}, terrOf: {}, rel: {}, ally: {}, wars: [], q: [], log: [] };
  for (const k of PLAYABLE) {
    const pc = gdppc(k), lvl = clamp(15 + 25 * Math.log10(pc / 400), 8, 95);
    g.terr[k] = { gdp: Q[k].gdp, pop: Q[k].pop, infra: lvl, qol: clamp(lvl - 3, 8, 95), occ: null };
    g.owner[k] = k; g.terrOf[k] = [k];
    const ideo = IDEO0[k] || 'dem', u = initialUnits(k), soldiers = u.inf;
    const spend = Q[k].gdp * Q[k].milPct / 100 * 1e9 / Math.max(1, soldiers); // USD por soldado
    g.n[k] = { ideo, ideoDay: -999, stab: ideo === 'dem' ? 70 : 72, treasury: Q[k].gdp * .02, fund: Q[k].gdp * Q[k].milPct / 100 * .2,
      bud: { mil: clamp(Q[k].milPct / 12 * 100, 2, 90), infra: 20, qol: 35 }, u,
      tech: clamp(.5 + .35 * Math.log10(spend / 1e4), .6, 1.4), pm: clamp(Math.pow(pc / 20000, .8), .25, 3.5), cf: 1, wins: 0, prio: null, relDay: {} };
  }
  // cada país arranca gastando ~85 % de su presupuesto militar real en mantener su ejército real: solo crece si sube el gasto
  const tmp = G; G = g;
  for (const k of PLAYABLE) { const n = g.n[k], mb = revenue(k) * n.bud.mil / 100; n.cf = clamp(.85 * mb / Math.max(1e-6, upkeep(k)), .3, 4); }
  G = tmp;
  ALLY0.forEach(([a, b]) => { if (g.n[a] && g.n[b]) g.ally[pk(a, b)] = 1; });
  // situación real de partida: la guerra de Rusia en Ucrania ya está en curso
  g.wars.push({ a: 'ru', b: 'ua', day: 0, r: 1 }); g.terr.ua.occ = { by: 'ru', pct: 18 };
  g.n.ua.aid = 1.4; // ayuda militar occidental (se va reduciendo con los años)
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
const navalPow = k => G.n[k].u.ship * 250 + G.n[k].u.air * 50;
function gdpOf(k) { let s = 0; for (const t of G.terrOf[k] || []) s += G.terr[t].gdp * clamp((G.terr[t].infra + 20) / 100, .2, 1); return s; }
const popOf = k => (G.terrOf[k] || []).reduce((s, t) => s + G.terr[t].pop, 0);
// B$/año: solo la parte del gasto público que decide el jugador (el resto: jubilaciones, administración, deuda)
const revenue = k => gdpOf(k) * .12 * ideoOf(k).tax;
function upkeep(k) { // B$/año
  const n = G.n[k], u = n.u; let s = u.inf * 1.2e-4 * n.pm;
  for (const t of UK) if (t !== 'inf' && t !== 'rifle') s += u[t] / UNITS[t].lot * UNITS[t].price * .25 / 1000;
  return s * n.cf;
}
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
function landNeighbors(k) { // dueños con frontera terrestre (o marítima para islas) con k
  nbCache = nbCache || {};
  if (nbCache[k]) return nbCache[k];
  const s = new Set(); for (const t of G.terrOf[k] || []) for (const a of C[t].adj) { const o = G.owner[a]; if (o && o !== k) s.add(o); }
  return (nbCache[k] = s);
}
function navalRange(k) { return G.n[k].u.ship >= 5 ? 120 + G.n[k].u.ship * 2.5 : 0; }
function seaTarget(a, b, max = 1e9) { // territorio de b alcanzable por mar desde a
  const rng = Math.min(max, navalRange(a)); if (!rng) return null;
  const from = (G.terrOf[a] || []).map(homeC); let best = null, bd = rng;
  for (const t of G.terrOf[b] || []) { if (Q[t].ll) continue; for (const f of from) { const d = wdist(f, homeC(t)); if (d < bd) { bd = d; best = t; } } } // sin costa: no hay desembarco
  return best;
}
const canReach = (a, b) => landNeighbors(a).has(b) || !!seaTarget(a, b);

/* ======================= GUERRA ======================= */
function news(msg, cls = '', mine = false) {
  G.log.unshift({ d: G.day, msg }); G.log.length = Math.min(G.log.length, 60);
  if (mine || cls) pushNews(msg, cls);
}
function declareWar(a, b, depth = 0) {
  if (a === b || atWar(a, b) || !G.n[a] || !G.n[b]) return;
  if (allied(a, b)) delete G.ally[pk(a, b)];
  G.wars.push({ a, b, day: G.day, r: 1 });
  G.tension = clamp(G.tension + 1.5, 0, 100);
  addRel(a, b, -60);
  alive().forEach(o => { if (o !== a && o !== b && rel(o, b) >= 70) addRel(o, a, -10); });
  if (a === G.me && G.n[a].ideo === 'dem') G.n[a].stab = clamp(G.n[a].stab - 8, 0, 100);
  const mine = a === G.me || b === G.me;
  news(`${name(a)} declaró la guerra a ${name(b)}`, mine ? 'bad' : (depth ? '' : 'bad'), mine);
  if (depth > 1) return;
  // los aliados del atacado acuden en su defensa
  for (const x of alliesOf(b)) {
    if (x === a || atWar(x, a) || rel(x, b) < 50 || allied(x, a)) continue;
    if (x === G.me) askHelp(b, a);
    else if (canReach(x, a) && Math.random() < rel(x, b) / 140) { declareWar(x, a, depth + 1); news(`${name(x)} entra en la guerra para defender a ${name(b)}`, 'bad', b === G.me || a === G.me); }
  }
}
function makePeace(a, b) {
  G.wars = G.wars.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
  for (const t of PLAYABLE) { const oc = G.terr[t].occ; if (oc && ((oc.by === a && G.owner[t] === b) || (oc.by === b && G.owner[t] === a))) G.terr[t].occ = null; }
  addRel(a, b, 25); G.tension = clamp(G.tension - 1, 0, 100);
  news(`Paz entre ${name(a)} y ${name(b)}`, 'good', a === G.me || b === G.me); dirty = true;
}
function transfer(t, to) {
  const from = G.owner[t];
  G.terrOf[from] = G.terrOf[from].filter(x => x !== t); (G.terrOf[to] = G.terrOf[to] || []).push(t);
  G.owner[t] = to; const T = G.terr[t]; T.occ = null; T.infra *= .6; T.qol = Math.max(5, T.qol - 15);
  invalidateOwners(from, to); nbCache = null;
  if (G.n[from]) G.n[from].stab = clamp(G.n[from].stab - 6, 0, 100);
  return from;
}
function eliminate(k, by) {
  // el vencedor se queda con lo que queda del ejército en material (no con los soldados)
  const u = G.n[k].u, w = G.n[by].u; for (const t of ['tank', 'art', 'mlrs', 'heli', 'rifle']) w[t] += Math.round(u[t] * .25);
  G.n[by].treasury += Math.max(0, G.n[k].treasury) * .5; G.n[by].wins++;
  delete G.n[k]; G.wars = G.wars.filter(x => x.a !== k && x.b !== k);
  Object.keys(G.ally).forEach(p => { if (p.split('|').includes(k)) delete G.ally[p]; });
  for (const t of PLAYABLE) if (G.terr[t].occ && G.terr[t].occ.by === k) G.terr[t].occ = null;
  if (sel === k) sel = null;
  news(`${up(name(k))} CAPITULÓ ante ${name(by)}`, 'bad', true);
  if (k === G.me) { G.dead = by; setSpeed(0); showDefeat(by); }
  else if (alive().length === 1) { setSpeed(0); showVictory(alive()[0]); }
}
function conquer(t, by) {
  const from = transfer(t, by);
  news(`${name(by)} conquistó ${name(t)}`, '', by === G.me || from === G.me);
  // cae el territorio de origen (la capital): el país capitula y entrega el resto
  if (t === from || !G.terrOf[from].length) { [...G.terrOf[from]].forEach(x => transfer(x, by)); eliminate(from, by); }
}
function fight(w) {
  const { a, b } = w;
  const land = landNeighbors(a).has(b);
  if (!land && !seaTarget(a, b) && !seaTarget(b, a)) { w.r = 1; w.front = false; return; }
  w.front = true;
  const share = (k, e) => { const es = enemiesOf(k).filter(x => canReach(k, x) || canReach(x, k)); const tot = es.reduce((s, x) => s + power(x), 0) || 1; return power(e) / tot; };
  const sa = share(a, b), sb = share(b, a);
  const Sa = power(a) * sa * (land ? 1 : .5), Sb = power(b, true) * sb * 1.4;
  const r = Sa / Math.max(1, Sb); w.r = r;
  const loss = (k, f, s) => { const u = G.n[k].u; for (const t of UK) if (t !== 'rifle') u[t] = Math.max(0, u[t] * (1 - f * s)); u.rifle = Math.max(0, u.rifle * (1 - f * s * .6)); };
  loss(a, Math.min(.01, .0016 * Math.pow(1 / r, .6)), sa); loss(b, Math.min(.01, .0016 * Math.pow(r, .6)), sb);
  const [x, y, rr] = r >= 1 ? [a, b, r] : [b, a, 1 / r];
  if (rr < 1.3) return; // guerra de trincheras: con fuerzas parejas el frente no se mueve
  // primero recupera lo propio ocupado por el rival
  const mine = (G.terrOf[x] || []).find(t => G.terr[t].occ && G.terr[t].occ.by === y);
  const sp = .9 * Math.pow(Math.min(rr, 6) - 1.25, .7) + .05;
  if (mine) { const oc = G.terr[mine].occ; oc.pct -= sp * 2; if (oc.pct <= 0) G.terr[mine].occ = null; dirty = true; return; }
  let t = (G.terrOf[y] || []).find(t => G.terr[t].occ && G.terr[t].occ.by === x);
  if (!t) {
    if (landNeighbors(x).has(y)) t = G.terrOf[y].filter(t => C[t].adj.some(n => G.owner[n] === x)).sort((p, q) => C[p].area - C[q].area)[0];
    t = t || seaTarget(x, y);
    if (!t || G.terr[t].occ) return; // ya lo ocupa otro
    G.terr[t].occ = { by: x, pct: 0 };
  }
  const T = G.terr[t], area = C[t].area || 1e4;
  T.occ.pct += sp / Math.pow(area / 1e5 + .3, .35) * (land ? 1 : .6); // países grandes tardan mucho más
  T.infra = Math.max(3, T.infra - .15); T.qol = Math.max(3, T.qol - .05);
  dirty = true;
  if (T.occ.pct >= 100) conquer(t, x);
}

/* ======================= SIMULACIÓN DIARIA ======================= */
function buy(k, type, lots) {
  const n = G.n[k], U = UNITS[type];
  const unit = U.price * (type === 'inf' ? n.pm * ideoOf(k).rec : 1) / 1000; // B$
  const cost = unit * lots; let pay = Math.min(cost, Math.max(0, n.fund)); const rest = cost - pay;
  if (rest > n.treasury + 1e-9) return false;
  if (type === 'inf') { const cap = popOf(k) * .05; const queued = G.q.filter(o => o.k === k && o.t === 'inf').reduce((s, o) => s + o.n, 0); if (n.u.inf + queued + U.lot * lots > cap) return false; }
  n.fund -= pay; n.treasury -= rest;
  G.q.push({ k, t: type, n: U.lot * lots, day: G.day + U.days });
  return true;
}
function spendDev(k, field, budget, costRate, mult) {
  // invierte en el territorio prioritario o el peor
  const ts = (G.terrOf[k] || []).filter(t => G.terr[t][field] < 99.5); if (!ts.length) return;
  const n = G.n[k]; const t = ts.includes(n.prio) ? n.prio : ts.reduce((a, b) => (G.terr[b][field] < G.terr[a][field] ? b : a));
  const T = G.terr[t]; T[field] = Math.min(100, T[field] + budget * mult / Math.max(.001, T.gdp * costRate));
}
function dayTick() {
  G.day++; nbCache = null;
  const monthly = G.day % 30 === 0;
  for (const k of alive()) {
    const n = G.n[k], R = revenue(k) / 365, I = ideoOf(k);
    const b = n.bud, used = (b.mil + b.infra + b.qol) / 100;
    n.fund += R * b.mil / 100 - upkeep(k) / 365;
    if (n.fund < 0) { n.treasury += n.fund; n.fund = 0; }
    n.treasury += R * Math.max(0, 1 - used);
    if (n.treasury < 0) { n.stab = Math.max(0, n.stab - .08); for (const t of UK) n.u[t] *= .9995; }
    spendDev(k, 'infra', R * b.infra / 100, .004, 1);
    spendDev(k, 'qol', R * b.qol / 100, .006, I.qolm);
    const war = warsOf(k).length > 0;
    for (const t of G.terrOf[k]) {
      const T = G.terr[t];
      const g = .015 + .02 * (T.infra - 50) / 50 + .01 * (T.qol - 50) / 50 + I.growth - (war ? .015 : 0) - (T.occ ? .1 : 0);
      T.gdp *= 1 + g / 365;
    }
    const target = 40 + avgQol(k) * .5 + (I.stab || 0) - warsOf(k).length * 6;
    n.stab += (target - n.stab) * .004;
  }
  for (let i = G.q.length - 1; i >= 0; i--) { const o = G.q[i]; if (o.day <= G.day) { if (G.n[o.k]) G.n[o.k].u[o.t] += o.n; G.q.splice(i, 1);
    if (o.k === G.me) pushNews(`Llegaron ${fmtInt(o.n)} × ${UNITS[o.t].n}`, 'good'); } }
  for (const w of [...G.wars]) if (G.n[w.a] && G.n[w.b] && G.wars.includes(w)) fight(w);
  G.tension = clamp(G.tension + .015, 0, 100);
  if (monthly) monthTick();
}
const avgQol = k => { const ts = G.terrOf[k] || []; return ts.reduce((s, t) => s + G.terr[t].qol, 0) / Math.max(1, ts.length); };
function monthTick() {
  for (const t of PLAYABLE) { const T = G.terr[t]; T.infra = Math.max(3, T.infra - .15); T.qol = Math.max(3, T.qol - .2); T.pop *= 1 + (.004 + T.qol / 10000) / 12; }
  Object.keys(G.rel).forEach(k => { G.rel[k] *= .985; });
  for (const k of alive()) if (G.n[k].aid > 1) { const n = G.n[k]; n.fund += 8 * (n.aid - 1); n.aid = Math.max(1, n.aid - .01); } // ayuda: plata y equipo
  for (const k of alive()) if (k !== G.me) ai(k);
  autosave();
}
function ai(k) {
  const n = G.n[k], I = ideoOf(k), wars = warsOf(k);
  // presupuesto: en guerra sube el gasto militar
  n.bud.mil = wars.length ? clamp(Math.max(n.bud.mil, 45), 0, 75) : clamp(Q[k].milPct / 12 * 100, 2, 90);
  if (n.bud.mil + n.bud.infra + n.bud.qol > 100) n.bud.qol = Math.max(0, 100 - n.bud.mil - n.bud.infra);
  // compras
  const budget = n.fund * (wars.length ? .7 : .2) + (wars.length ? Math.max(0, n.treasury) * .05 : 0);
  if (budget > .01) {
    const mix = { inf: .25, rifle: .04, rpg: .03, tank: .16, art: .08, mlrs: .06, air: .2, heli: .06, drone: .06, sam: .03, ship: .03 };
    for (const [t, f] of Object.entries(mix)) {
      const unit = UNITS[t].price * (t === 'inf' ? n.pm * I.rec : 1) / 1000, lots = Math.floor(budget * f / unit);
      if (lots > 0) buy(k, t, Math.min(lots, t === 'ship' ? 3 : 5000));
    }
    if (n.u.rifle < n.u.inf) buy(k, 'rifle', Math.ceil((n.u.inf - n.u.rifle) / 1000));
  }
  // paz si va perdiendo hace tiempo
  for (const w of wars) {
    const losing = (w.a === k ? w.r : 1 / w.r) < .7, other = w.a === k ? w.b : w.a;
    if (losing && G.day - w.day > 120 && Math.random() < .25) {
      if (other === G.me) askPeace(k);
      else if ((w.a === other ? w.r : 1 / w.r) < 1 || G.day - w.day > 700) makePeace(k, other);
    }
  }
  // nueva guerra: rival débil, enemistado y al alcance
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
  // alianzas nuevas entre vecinos muy amigos
  if (Math.random() < .03) for (const o of landNeighbors(k)) if (o !== G.me && !allied(k, o) && rel(k, o) >= 85) { G.ally[pk(k, o)] = 1; break; }
}
function autosave() { if (G && G.n[G.me]) store(G); }

/* ======================= INTERFAZ ======================= */
let speed = 0, acc = 0, modalOpen = false, sheetFor = null, tab = 'res';
function setSpeed(s) { speed = s; document.querySelectorAll('.speeds button').forEach(b => b.classList.toggle('on', +b.dataset.sp === s)); }
document.querySelectorAll('.speeds button').forEach(b => (b.onclick = () => setSpeed(+b.dataset.sp)));
function pushNews(msg, cls = '') {
  const box = $('news'), d = document.createElement('div'); d.className = cls; d.textContent = msg; box.prepend(d);
  while (box.children.length > 4) box.lastChild.remove(); setTimeout(() => d.remove(), 7000);
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2200); }
function hud() {
  const me = G.me, n = G.n[me];
  document.body.style.setProperty('--barh', document.querySelector('.bar').offsetHeight + 'px');
  $('sDate').textContent = dateOf(G.day);
  $('sTension').textContent = Math.round(G.tension) + ' %';
  if (!n) return;
  $('sTreasury').textContent = money(n.treasury); $('sFund').textContent = money(n.fund);
  $('sGdp').textContent = money(gdpOf(me)); $('sPower').textContent = fmtPow(power(me));
  const ws = warsOf(me);
  $('wars').innerHTML = ws.map(w => { const e = w.a === me ? w.b : w.a, r = w.a === me ? w.r : 1 / w.r, pct = Math.round(100 * r / (1 + r));
    return `<button class="war" data-k="${e}"><img src="${flagSrc(me)}" alt=""><span class="vs">VS</span><img src="${flagSrc(e)}" alt=""><span>${name(e)}</span>
      <span class="bar2" title="Ventaja en el frente"><i style="width:${w.front ? pct : 0}%"></i></span></button>`; }).join('') +
    (G.wars.length ? `<div class="war" style="border-color:var(--line)">🌍 ${G.wars.length} guerra${G.wars.length > 1 ? 's' : ''} en el mundo</div>` : '');
  $('wars').querySelectorAll('[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
}
const relLabel = r => (r >= 80 ? 'Excelente' : r >= 60 ? 'Buena' : r >= 40 ? 'Neutral' : r >= 20 ? 'Mala' : 'Hostil');
const relColor = r => (r >= 60 ? 'var(--green)' : r >= 40 ? 'var(--yellow)' : r >= 20 ? 'var(--orange)' : 'var(--red)');
const relBar = r => `<div class="relbar"><i style="width:${r}%;background:${relColor(r)}"></i></div>`;
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; }
$('sheetClose').onclick = () => { $('sheet').hidden = true; sheetFor = null; sel = null; dirty = true; };

function openCountry(k) {
  const o = G.owner[k] && G.n[G.owner[k]] ? G.owner[k] : k; // tocar un territorio abre a su dueño
  if (o === G.me) return openMe(tab);
  sel = o; sheetFor = o; dirty = true; renderCountry(k);
}
function renderCountry(terr) {
  const o = sheetFor, me = G.me, n = G.n[o]; if (!n) return;
  const r = rel(me, o), war = atWar(me, o), al = allied(me, o), u = n.u, myN = G.n[me];
  const reach = myN && canReach(me, o), cost = Math.max(.05, gdpOf(me) * .0005);
  const cooldown = myN && myN.relDay[o] && G.day - myN.relDay[o] < 30;
  const T = terr && terr !== o && G.owner[terr] === o ? G.terr[terr] : null;
  const allyWars = al ? enemiesOf(o).filter(e => e !== me && !atWar(me, e)) : [];
  openSheet(`<div class="sh-head"><img src="${flagSrc(o)}" alt=""><div><h2>${up(name(o))}</h2>
      <p>${ideoOf(o).n}${al ? ' <span class="chip2">ALIADO</span>' : ''}${war ? ' <span class="chip2 war">EN GUERRA</span>' : ''}</p></div></div>
    ${T ? `<div class="hint">Territorio conquistado: <b>${name(terr)}</b> · Infraestructura ${Math.round(T.infra)} · Calidad de vida ${Math.round(T.qol)}</div>` : ''}
    <div class="sec"><h3>RELACIÓN CON ${up(name(me))}</h3><div class="slider"><b>${relLabel(r)}</b><span>${r} / 100</span></div>${relBar(r)}</div>
    <div class="grid2">
      <div class="cell"><small>PBI</small><b>${money(gdpOf(o))}</b></div><div class="cell"><small>POBLACIÓN</small><b>${fmtInt(popOf(o) / 1e6)} M</b></div>
      <div class="cell"><small>PODER</small><b>${fmtPow(power(o))}</b></div><div class="cell"><small>TERRITORIOS</small><b>${G.terrOf[o].length}</b></div>
      <div class="cell"><small>SOLDADOS</small><b>${fmtInt(u.inf)}</b></div><div class="cell"><small>TANQUES</small><b>${fmtInt(u.tank)}</b></div>
      <div class="cell"><small>AVIONES</small><b>${fmtInt(u.air)}</b></div><div class="cell"><small>BUQUES</small><b>${fmtInt(u.ship)}</b></div>
    </div>
    ${enemiesOf(o).length ? `<div class="hint">En guerra con: ${enemiesOf(o).map(name).join(', ')}</div>` : ''}
    ${myN ? `<div class="acts">
      ${!war ? `<button class="btn good" data-a="rel" ${cooldown ? 'disabled' : ''}>MEJORAR RELACIÓN (${money(cost)})</button>` : ''}
      ${!war && !al ? `<button class="btn" data-a="ally" ${r < 70 ? 'disabled title="Necesitás 70 de relación"' : ''}>PROPONER ALIANZA</button>` : ''}
      ${al ? `<button class="btn" data-a="unally">ROMPER ALIANZA</button>` : ''}
      ${allyWars.length ? `<button class="btn warbtn" data-a="help">DEFENDERLO (${allyWars.map(name).join(', ')})</button>` : ''}
      ${war ? `<button class="btn good" data-a="peace">PROPONER PAZ</button>` : `<button class="btn warbtn" data-a="war">DECLARAR GUERRA</button>`}
    </div>
    ${!war && !reach ? '<div class="hint">No tenés frontera ni flota suficiente para invadirlo: necesitás buques de guerra.</div>' : ''}` : ''}`);
  $('sheetBody').querySelectorAll('[data-a]').forEach(b => (b.onclick = () => countryAction(b.dataset.a, o, cost)));
}
function countryAction(a, o, cost) {
  const me = G.me, n = G.n[me];
  if (a === 'rel') { if (n.treasury < cost) return toast('No alcanza el tesoro'); n.treasury -= cost; addRel(me, o, 6); n.relDay[o] = G.day; toast(`Relación con ${name(o)} +6`); }
  if (a === 'ally') { if (rel(me, o) >= 70 && Math.random() < (rel(me, o) - 50) / 40) { G.ally[pk(me, o)] = 1; news(`${name(o)} aceptó una alianza con ${name(me)}`, 'good', true); } else { addRel(me, o, -3); toast(`${name(o)} rechazó la alianza`); } }
  if (a === 'unally') { delete G.ally[pk(me, o)]; addRel(me, o, -20); toast('Alianza rota'); }
  if (a === 'help') { enemiesOf(o).forEach(e => { if (e !== me && !atWar(me, e)) declareWar(me, e, 2); }); addRel(me, o, 15); }
  if (a === 'war') return confirmBox(`¿Declarar la guerra a ${name(o)}?`, `Sus aliados (${alliesOf(o).filter(x => rel(x, o) >= 50).map(name).join(', ') || 'ninguno'}) pueden entrar a defenderlo. La tensión mundial sube.`, 'DECLARAR GUERRA', () => { declareWar(me, o); renderCountry(); hud(); });
  if (a === 'peace') {
    const w = G.wars.find(w => (w.a === me && w.b === o) || (w.b === me && w.a === o)), myR = w.a === me ? w.r : 1 / w.r;
    if (myR > 1.2 || (G.day - w.day > 365 && Math.random() < .4) || Math.random() < .1) makePeace(me, o); else toast(`${name(o)} rechazó la paz`);
  }
  renderCountry(); hud(); dirty = true;
}

function openMe(t = 'res') {
  tab = t; sheetFor = G.me; sel = null; dirty = true;
  const me = G.me, n = G.n[me]; if (!n) return;
  const tabs = [['res', 'RESUMEN'], ['bud', 'PRESUPUESTO'], ['ideo', 'IDEOLOGÍA'], ['army', 'EJÉRCITO'], ['terr', 'TERRITORIOS'], ['dip', 'DIPLOMACIA']];
  let body = '';
  if (t === 'res') {
    const R = revenue(me);
    body = `<div class="grid2">
      <div class="cell"><small>PBI</small><b>${money(gdpOf(me))}</b></div><div class="cell"><small>RECAUDACIÓN / AÑO</small><b>${money(R)}</b></div>
      <div class="cell"><small>TESORO</small><b>${money(n.treasury)}</b></div><div class="cell"><small>FONDO MILITAR</small><b>${money(n.fund)}</b></div>
      <div class="cell"><small>POBLACIÓN</small><b>${fmtInt(popOf(me) / 1e6)} M</b></div><div class="cell"><small>ESTABILIDAD</small><b>${Math.round(n.stab)} %</b></div>
      <div class="cell"><small>PODER MILITAR</small><b>${fmtPow(power(me))}</b></div><div class="cell"><small>TECNOLOGÍA</small><b>×${n.tech.toFixed(2)}</b></div>
      <div class="cell"><small>MANTENIMIENTO / AÑO</small><b>${money(upkeep(me))}</b></div><div class="cell"><small>CALIDAD DE VIDA</small><b>${Math.round(avgQol(me))}</b></div>
    </div>
    <div class="hint">El tesoro recibe lo que no asignás en el presupuesto. El fondo militar recibe la parte militar menos el mantenimiento; las compras salen primero del fondo y después del tesoro.</div>
    ${warsOf(me).length ? `<div class="sec"><h3>GUERRAS</h3><div class="list">${warsOf(me).map(w => { const e = w.a === me ? w.b : w.a, r = w.a === me ? w.r : 1 / w.r;
      return `<button class="rel" data-k="${e}"><img src="${flagSrc(e)}" alt=""><span>${name(e)}</span>${relBar(Math.round(100 * r / (1 + r)))}<span>${w.front ? (r >= 1 ? '▲' : '▼') : '—'}</span></button>`; }).join('')}</div></div>` : ''}`;
  }
  if (t === 'bud') {
    const R = revenue(me), b = n.bud, rest = Math.max(0, 100 - b.mil - b.infra - b.qol);
    const sl = (k, label, hint) => `<label class="slider" for="b_${k}">${label}<span>${b[k].toFixed(0)} % · ${money(R * b[k] / 100)}/año</span>
      <input id="b_${k}" type="range" min="0" max="100" step="1" value="${b[k]}" data-k="${k}"></label><div class="hint">${hint}</div>`;
    body = `<div class="sec"><h3>RECAUDACIÓN ANUAL: ${money(R)}</h3>
      ${sl('mil', 'Militar', `Paga el mantenimiento (${money(upkeep(me))}/año); el sobrante va al fondo militar para comprar armamento.`)}
      ${sl('infra', 'Infraestructura', 'Reconstruye y mejora rutas, energía y fábricas: más PBI.')}
      ${sl('qol', 'Calidad de vida', 'Salud, educación y vivienda: más estabilidad, población y crecimiento.')}
      <div class="slider" style="margin-top:8px">Reserva al tesoro<span>${rest.toFixed(0)} % · ${money(R * rest / 100)}/año</span></div></div>`;
  }
  if (t === 'ideo') {
    const cd = G.day - n.ideoDay < 365;
    body = `<div class="hint">Cambiar de ideología baja la estabilidad 25 puntos y no se puede repetir por un año.${cd ? ` <b>Disponible el ${dateOf(n.ideoDay + 365)}.</b>` : ''}</div>
      <div class="ideos">${Object.entries(IDEO).map(([k, I]) => `<button class="ideo ${n.ideo === k ? 'on' : ''}" data-i="${k}" ${cd && n.ideo !== k ? 'disabled' : ''}>
        <b>${I.n}</b><ul>${I.d.map(([c, x]) => `<li class="${c}">${x}</li>`).join('')}</ul></button>`).join('')}</div>`;
  }
  if (t === 'army') {
    const u = n.u, q = G.q.filter(o => o.k === me);
    body = `<div class="units">${UK.map(k => `<div><span>${UNITS[k].n}</span><b>${fmtInt(u[k])}</b></div>`).join('')}</div>
      <div class="hint">Soldados sin fusil rinden 25 %. Tope de reclutamiento: 5 % de la población (${fmtInt(popOf(me) * .05)}).</div>
      <div class="sec"><h3>COMPRAR ARMAMENTO · disponible ${money(n.fund + Math.max(0, n.treasury))}</h3><div class="shop">${UK.map(k => {
        const U = UNITS[k], p = U.price * (k === 'inf' ? n.pm * ideoOf(me).rec : 1) / 1000;
        return `<div class="item"><b>${U.n}${U.lot > 1 ? ` ×${fmtInt(U.lot)}` : ''}</b><small>${U.desc} · ${U.days} días · ${money(p)}</small>
          <div class="buy"><button data-b="${k}" data-l="1">×1</button><button data-b="${k}" data-l="10">×10</button></div></div>`; }).join('')}</div></div>
      ${q.length ? `<div class="sec"><h3>EN CAMINO</h3><div class="units">${q.map(o => `<div><span>${UNITS[o.t].n}</span><b>${fmtInt(o.n)} · ${o.day - G.day} d</b></div>`).join('')}</div></div>` : ''}`;
  }
  if (t === 'terr') {
    body = `<div class="hint">El presupuesto de infraestructura y calidad de vida va primero al territorio marcado como prioridad (si no, al más atrasado). Los territorios conquistados llegan dañados por la guerra.</div>
      <div class="list">${G.terrOf[me].map(k => { const T = G.terr[k], c = T.gdp * .04;
        return `<div class="terr"><img src="${flagSrc(k)}" alt=""><div><div>${name(k)}${n.prio === k ? ' <span class="chip2">PRIORIDAD</span>' : ''}${T.occ ? ' <span class="chip2 war">INVADIDO</span>' : ''}</div>
          <div class="mini"><span>Infra ${Math.round(T.infra)}</span>${relBar(T.infra)}<span>Vida ${Math.round(T.qol)}</span>${relBar(T.qol)}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px"><button data-p="${k}">${n.prio === k ? 'QUITAR' : 'PRIORIDAD'}</button><button data-r="${k}" title="+10 de infraestructura ya">REPARAR ${money(c)}</button></div></div>`; }).join('')}</div>`;
  }
  if (t === 'dip') {
    const list = alive().filter(o => o !== me).sort((a, b) => rel(me, b) - rel(me, a));
    body = `<div class="list">${list.map(o => { const r = rel(me, o);
      return `<button class="rel" data-k="${o}"><img src="${flagSrc(o)}" alt=""><span>${name(o)}${allied(me, o) ? ' <span class="chip2">ALIADO</span>' : ''}${atWar(me, o) ? ' <span class="chip2 war">GUERRA</span>' : ''}</span>${relBar(r)}<span>${r}</span></button>`; }).join('')}</div>`;
  }
  openSheet(`<div class="sh-head"><img src="${flagSrc(me)}" alt=""><div><h2>${up(name(me))}</h2><p>${ideoOf(me).n} · ${G.terrOf[me].length} territorio${G.terrOf[me].length > 1 ? 's' : ''}</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="sec">${body}</div>`);
  const sb = $('sheetBody');
  sb.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => openMe(b.dataset.t)));
  sb.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
  sb.querySelectorAll('input[data-k]').forEach(inp => (inp.oninput = () => {
    const k = inp.dataset.k, others = ['mil', 'infra', 'qol'].filter(x => x !== k);
    n.bud[k] = Math.min(+inp.value, 100 - others.reduce((s, x) => s + n.bud[x], 0)); inp.value = n.bud[k];
    inp.parentElement.querySelector('span').textContent = `${n.bud[k].toFixed(0)} % · ${money(revenue(me) * n.bud[k] / 100)}/año`;
    const rest = Math.max(0, 100 - n.bud.mil - n.bud.infra - n.bud.qol), last = sb.querySelector('.slider:last-child span');
    if (last) last.textContent = `${rest.toFixed(0)} % · ${money(revenue(me) * rest / 100)}/año`;
  }));
  sb.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => {
    const k = b.dataset.i; if (k === n.ideo) return;
    confirmBox(`¿Cambiar a ${IDEO[k].n}?`, 'La estabilidad baja 25 puntos y no podés volver a cambiar por un año.', 'CAMBIAR', () => {
      n.ideo = k; n.ideoDay = G.day; n.stab = Math.max(0, n.stab - 25); news(`${name(me)} adoptó el ${IDEO[k].n.toLowerCase()}`, 'good', true); openMe('ideo'); });
  }));
  sb.querySelectorAll('[data-b]').forEach(b => (b.onclick = () => {
    if (buy(me, b.dataset.b, +b.dataset.l)) { toast(`Pedido: ${UNITS[b.dataset.b].n} ×${b.dataset.l}`); openMe('army'); hud(); }
    else toast(b.dataset.b === 'inf' ? 'Sin fondos o sin población para reclutar' : 'No alcanza el dinero');
  }));
  sb.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => { n.prio = n.prio === b.dataset.p ? null : b.dataset.p; openMe('terr'); }));
  sb.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => {
    const T = G.terr[b.dataset.r], c = T.gdp * .04; if (n.treasury < c) return toast('No alcanza el tesoro');
    n.treasury -= c; T.infra = Math.min(100, T.infra + 10); openMe('terr'); hud();
  }));
}
$('btnMe').onclick = () => openMe('res');

/* modales */
const modalQ = [];
function modal(html, wire) { modalQ.push([html, wire]); if (!modalOpen) nextModal(); }
function nextModal() {
  const m = modalQ.shift(); if (!m) { modalOpen = false; $('modal').hidden = true; return; }
  modalOpen = true; $('modal').hidden = false; $('modalBody').innerHTML = m[0];
  const close = () => nextModal(); m[1]($('modalBody'), close);
}
function confirmBox(title, text, ok, fn) {
  modal(`<h2>${title}</h2><p>${text}</p><div class="acts"><button class="btn" data-x>CANCELAR</button><button class="btn primary" data-ok>${ok}</button></div>`,
    (el, close) => { el.querySelector('[data-x]').onclick = close; el.querySelector('[data-ok]').onclick = () => { close(); fn(); }; });
}
function askHelp(ally, aggressor) {
  modal(`<h2>${name(ally)} pide ayuda</h2><p><b>${name(aggressor)}</b> invadió a tu aliado <b>${name(ally)}</b>. ¿Entrás en la guerra para defenderlo?</p>
    <div class="acts"><button class="btn" data-no>NO INTERVENIR</button><button class="btn warbtn" data-yes>DEFENDERLO</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = () => { addRel(G.me, ally, -25); close(); };
    el.querySelector('[data-yes]').onclick = () => { declareWar(G.me, aggressor, 2); addRel(G.me, ally, 15); close(); hud(); };
  });
}
function askPeace(k) {
  modal(`<h2>${name(k)} propone la paz</h2><p>Si aceptás, se levantan las ocupaciones en curso entre los dos países (lo ya conquistado queda como está).</p>
    <div class="acts"><button class="btn" data-no>SEGUIR LA GUERRA</button><button class="btn good" data-yes>ACEPTAR LA PAZ</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = close; el.querySelector('[data-yes]').onclick = () => { makePeace(G.me, k); close(); hud(); };
  });
}
function showDefeat(by) {
  store(null);
  modal(`<img src="${flagSrc(by)}" alt="" style="width:120px;border-radius:8px"><h2>${up(name(by))} TE CONQUISTÓ</h2><p>Duraste hasta el ${dateOf(G.day)}.</p>
    <div class="acts"><button class="btn" data-w>SEGUIR MIRANDO</button><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, (el, close) => {
    el.querySelector('[data-w]').onclick = close; el.querySelector('[data-n]').onclick = () => location.reload();
  });
}
function showVictory(w) {
  store(null);
  modal(`<img src="${flagSrc(w)}" alt="" style="width:140px;border-radius:8px"><h2>${w === G.me ? '¡DOMINASTE EL MUNDO!' : `¡${up(name(w))} DOMINA EL MUNDO!`}</h2>
    <p>${dateOf(G.day)} · ${G.terrOf[w].length} territorios.</p><div class="acts"><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, (el) => {
    el.querySelector('[data-n]').onclick = () => location.reload();
  });
}
$('btnMenu').onclick = () => {
  const was = speed; setSpeed(0);
  modal(`<h2>MENÚ</h2><p>La partida se guarda sola cada mes de juego.</p><div class="acts" style="flex-direction:column">
    <button class="btn primary" data-c>SEGUIR JUGANDO</button><button class="btn" data-s>GUARDAR AHORA</button><button class="btn" data-m>SALIR AL MENÚ PRINCIPAL</button></div>`, (el, close) => {
    el.querySelector('[data-c]').onclick = () => { close(); setSpeed(was || 1); };
    el.querySelector('[data-s]').onclick = () => { autosave(); toast('Partida guardada'); };
    el.querySelector('[data-m]').onclick = () => { autosave(); location.href = 'index.html'; };
  });
};

/* ======================= ELEGIR PAÍS ======================= */
let RANK = [];
function difficulty(i) { return i < 10 ? [0, 'FÁCIL'] : i < 35 ? [1, 'NORMAL'] : i < 90 ? [2, 'DIFÍCIL'] : [3, 'MUY DIFÍCIL']; }
function setupPick() {
  const tmp = G; G = newGame(PLAYABLE[0]); // sólo para calcular el poder inicial
  RANK = PLAYABLE.map(k => [k, power(k)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  G = tmp;
  const list = $('pickList');
  const draw = () => {
    const q = $('pickSearch').value.trim().toLowerCase();
    list.innerHTML = RANK.map((k, i) => [k, i]).filter(([k]) => !q || name(k).toLowerCase().includes(q)).map(([k, i]) => { const [d, l] = difficulty(i);
      return `<button class="prow ${pickSel === k ? 'on' : ''}" data-k="${k}" role="option"><span class="rk">#${i + 1}</span><img src="${flagSrc(k)}" alt=""><span>${name(k)}</span><span class="diff d${d}">${l}</span></button>`; }).join('');
    list.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => choose(b.dataset.k)));
  };
  $('pickSearch').oninput = draw; draw();
  pickDraw = draw;
  const s = loadSave(); $('btnLoad').hidden = !s;
  $('btnLoad').onclick = () => { G = s; startGame(); };
  $('btnStart').onclick = () => { G = newGame(pickSel); startGame(); };
}
let pickDraw = () => {};
function choose(k) {
  pickSel = k; $('btnStart').disabled = false; pickDraw();
  const i = RANK.indexOf(k), [d, l] = difficulty(i), q = Q[k], u = initialUnits(k);
  $('pickInfo').innerHTML = `<b style="color:#fff">${name(k)}</b> · ${IDEO[IDEO0[k] || 'dem'].n} · poder #${i + 1} · <span class="diff d${d}">${l}</span>
    <div class="kv"><div><small>PBI</small><b>${money(q.gdp)}</b></div><div><small>POBLACIÓN</small><b>${fmtInt(q.pop / 1e6)} M</b></div><div><small>SOLDADOS</small><b>${fmtInt(u.inf)}</b></div>
    <div><small>TANQUES</small><b>${fmtInt(u.tank)}</b></div><div><small>AVIONES</small><b>${fmtInt(u.air)}</b></div><div><small>BUQUES</small><b>${fmtInt(u.ship)}</b></div></div>`;
  const el = $('pickList').querySelector(`[data-k="${k}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  flyTo(RP[k].reduce((a, p) => bbUnion(a, p.bb), RP[k][0].bb), 3); dirty = true;
}
function startGame() {
  $('pick').hidden = true; $('hud').hidden = false;
  $('meFlag').src = flagSrc(G.me); $('meName').textContent = name(G.me);
  Object.keys(ownCache).forEach(k => delete ownCache[k]); borderPath = null; nbCache = null;
  if (!G.n[G.me]) { showDefeat(G.dead || alive()[0]); }
  flyTo(ownerParts(G.me).bb, 4); hud(); setSpeed(0);
  pushNews('En pausa: elegí la velocidad arriba a la derecha', '');
  if (G.day === 0) modal(`<h2>${up(name(G.me))}</h2><p>1 de enero de 2027. La guerra de Rusia en Ucrania sigue abierta y la tensión mundial crece cada día. Construí tu imperio: manejá el presupuesto, armá tu ejército, hacé aliados o invadí a tus vecinos. Gana el último país en pie.</p>
    <p class="hint">Tocá tu bandera (arriba a la izquierda) para administrar tu país. Tocá cualquier otro país para la diplomacia y la guerra.</p>
    <div class="acts"><button class="btn primary" data-ok>EMPEZAR</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = () => { close(); setSpeed(1); }; });
}

/* ======================= ENTRADA (arrastrar, zoom, tocar) ======================= */
const ptrs = new Map(); let drag = null, moved = 0;
mapCv.addEventListener('pointerdown', e => { mapCv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
  drag = { x: cam.x, y: cam.y, sx: e.clientX, sy: e.clientY, s: cam.s, d: null }; anim = null; });
mapCv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  const P = [...ptrs.values()];
  if (P.length === 2) { // pellizco
    const d = wdist(P[0], P[1]); if (!drag.d) { drag.d = d; drag.s = cam.s; } cam.s = drag.s * d / drag.d; moved = 99; clampCam(); return;
  }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; moved = Math.max(moved, Math.hypot(dx, dy));
  if (moved > 5) { mapCv.classList.add('dragging'); cam.x = drag.x - dx / cam.s; cam.y = drag.y - dy / cam.s; clampCam(); }
});
const endPtr = e => {
  ptrs.delete(e.pointerId); mapCv.classList.remove('dragging');
  if (ptrs.size === 0 && moved <= 5 && e.type === 'pointerup') {
    const k = hitTest(e.clientX, e.clientY);
    if (!G) { if (k) choose(k); } else if (k) openCountry(k);
  }
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: cam.x, y: cam.y, sx: p[0], sy: p[1], s: cam.s, d: null }; }
};
mapCv.addEventListener('pointerup', endPtr); mapCv.addEventListener('pointercancel', endPtr);
mapCv.addEventListener('wheel', e => {
  e.preventDefault(); anim = null;
  const f = Math.exp(-e.deltaY * .0015), wx = cam.x + (e.clientX - vw / 2) / cam.s, wy = cam.y + (e.clientY - vh / 2) / cam.s;
  cam.s *= f; clampCam(); cam.x = wx - (e.clientX - vw / 2) / cam.s; cam.y = wy - (e.clientY - vh / 2) / cam.s; clampCam();
}, { passive: false });
addEventListener('keydown', e => { if (G && e.code === 'Space' && !modalOpen && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpeed(speed ? 0 : 1); } });

/* ======================= BUCLE ======================= */
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(250, now - last); last = now;
  if (anim && !anim(now)) anim = null;
  if (G && G.n[G.me] !== undefined || (G && G.dead)) {
    if (speed && !modalOpen) {
      acc += dt; const per = 700 / speed; let n = 0;
      while (acc >= per && n++ < 6) { acc -= per; dayTick(); }
      if (now - hudT > 250) { hudT = now; hud(); if (!$('sheet').hidden && sheetFor && (sheetFor !== G.me ? true : tab === 'res' || tab === 'army')) {
        if (sheetFor === G.me) openMe(tab); else if (G.n[sheetFor]) renderCountry(); } }
    } else acc = 0;
  }
  if (dirty) { dirty = false; render(); }
  requestAnimationFrame(frame);
}
resize(); setupPick();
loadFlags().then(() => (dirty = true));
requestAnimationFrame(frame);

// autocomprobaciones de reglas clave
console.assert(relBase('ar', 'uy') >= 90 && relBase('us', 've') <= 25, 'relaciones de partida');
console.assert(Object.keys(UNITS).length === UK.length);
window.__conq = { get G() { return G; }, power, rel, dayTick, declareWar, gdpOf, upkeep, revenue, newGame, set G(v) { G = v; } };
})();
