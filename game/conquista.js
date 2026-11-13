/* EMPIRE — modo Conquista mundial
   Estrategia en tiempo real con pausa al estilo "dominación": el mundo es una grilla de puntos de tierra,
   los escuadrones se mueven por el mapa, chocan entre sí y anexan el terreno que pisan sin oposición. */
(() => {
'use strict';
const D = window.EMPIRE_DATA, C = D.countries, topo = D.topo, Q = window.CONQ_DATA;
const geoms = topo.objects.countries.geometries;
const geomBy = {}; geoms.forEach(g => (geomBy[g.properties.c] = g));
const PLAYABLE = Object.keys(C).filter(k => C[k].playable && geomBy[k] && Q[k]);
const NI = PLAYABLE.length, IDX = {}; PLAYABLE.forEach((k, i) => (IDX[k] = i));
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtInt = n => Math.round(n).toLocaleString('es-AR');
const fmtK = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + 'k' : String(Math.round(n)));
const up = s => s.toLocaleUpperCase('es');
const name = c => C[c].name;
const flagSrc = c => `flags/${c}.svg`;
const pick = a => a[Math.floor(Math.random() * a.length)];
function money(b) { // b en miles de millones de USD
  const m = b * 1000, s = m < 0 ? '-' : ''; const a = Math.abs(m);
  if (a >= 1e6) return `${s}US$ ${(a / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} bill.`;
  if (a >= 1000) return `${s}US$ ${(a / 1000).toLocaleString('es-AR', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })} mil M`;
  return `${s}US$ ${a.toLocaleString('es-AR', { maximumFractionDigits: a >= 10 ? 0 : 1 })} M`;
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dateOf = d => { const t = new Date(Date.UTC(2027, 0, 1) + Math.round(d) * 864e5); return `${t.getUTCDate()} ${MESES[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };

/* ======================= GEOMETRÍA ======================= */
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
geoms.forEach(g => { if (IDX[g.properties.c] == null) partsOf(topojson.feature(topo, g).geometry).forEach(p => grayPath.addPath(p.path)); });
const RP = PLAYABLE.map(k => partsOf(topojson.feature(topo, geomBy[k]).geometry).sort((a, b) => b.size - a.size));
const RPATH = RP.map(ps => { const p = new Path2D(); ps.forEach(x => p.addPath(x.path)); return p; });
const bbUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const bbCenter = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const RBB = RP.map(ps => ps.reduce((a, p) => bbUnion(a, p.bb), ps[0].bb));
const wdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ======================= GRILLA DE PUNTOS ======================= */
// el mundo se divide en celdas de CS×CS unidades; cada celda de tierra pertenece a un país de origen y a un dueño
const CS = 3, NX = Math.ceil(W / CS), NY = Math.ceil(H / CS), NC = NX * NY;
const cellC = new Uint8Array(NC).fill(255); // país de origen (índice)
const cellsOf = [];
{
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  for (let ci = 0; ci < NI; ci++) {
    const b = RBB[ci], gx0 = Math.max(0, Math.floor(b[0] / CS)), gy0 = Math.max(0, Math.floor(b[1] / CS));
    const gx1 = Math.min(NX - 1, Math.ceil(b[2] / CS)), gy1 = Math.min(NY - 1, Math.ceil(b[3] / CS)), gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1;
    cv.width = gw; cv.height = gh; cx.setTransform(1 / CS, 0, 0, 1 / CS, -gx0, -gy0); cx.fillStyle = '#000'; cx.fill(RPATH[ci]);
    const d = cx.getImageData(0, 0, gw, gh).data, list = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (d[(y * gw + x) * 4 + 3] >= 128) { const i = (gy0 + y) * NX + gx0 + x; if (cellC[i] === 255) { cellC[i] = ci; list.push(i); } }
    if (!list.length) { const [hx, hy] = RP[ci][0].c, i = clamp(Math.floor(hy / CS), 0, NY - 1) * NX + clamp(Math.floor(hx / CS), 0, NX - 1); // microestado: al menos un punto
      if (cellC[i] !== 255) cellsOf[cellC[i]] = cellsOf[cellC[i]].filter(x => x !== i); cellC[i] = ci; list.push(i); }
    cellsOf[ci] = list;
  }
  for (let ci = 0; ci < NI; ci++) cellsOf[ci] = Int32Array.from(cellsOf[ci].filter(i => cellC[i] === ci));
}
const LAND = Int32Array.from([].concat(...cellsOf.map(a => Array.from(a))));
const cxOf = i => (i % NX + .5) * CS, cyOf = i => (Math.floor(i / NX) + .5) * CS;
const cellAt = (x, y) => { const gx = Math.floor(x / CS), gy = Math.floor(y / CS); return gx < 0 || gy < 0 || gx >= NX || gy >= NY ? -1 : gy * NX + gx; };
// capital: el punto del país más cercano al centro de su territorio principal
const CAPITAL = cellsOf.map((cells, ci) => { const [hx, hy] = RP[ci][0].c; let best = cells[0], bd = 1e9; for (const i of cells) { const d = (cxOf(i) - hx) ** 2 + (cyOf(i) - hy) ** 2; if (d < bd) { bd = d; best = i; } } return best; });
// vecinos entre países de origen: frontera terrestre (o marítima para islas), del mapa de datos
const ADJ = PLAYABLE.map(k => C[k].adj.map(a => IDX[a]).filter(x => x != null));

/* ======================= BANDERAS ======================= */
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

/* ======================= REGLAS ======================= */
const ICON = {
  inf: 'M5 13a7 7 0 0 1 14 0v1H5z M3 14h18 M9 17h6 M12 14v6', rifle: 'M2 12h13l5-2v3l-5 1H9l-2 4H5l1-4H2z M13 10V8',
  rpg: 'M2 12h13 M15 9l6 3-6 3z M6 12v4 M10 12v3', tank: 'M3 15h18l-2 4H5z M6 15v-3h10v3 M11 12V9h9', art: 'M3 19h11 M6 19l4-7 M10 12l11-6 M7 19a2 2 0 1 0 .1 0',
  mlrs: 'M3 17h13v-4H3z M7 13l11-6 M10 13l11-6 M5 17v2 M14 17v2', air: 'M12 2l1.5 7 8 4v2l-8-2-.8 5 3 2v1l-3.7-.8-3.7.8v-1l3-2-.8-5-8 2v-2l8-4z',
  heli: 'M2 6h20 M12 6v3 M6 13a6 4 0 0 0 12 0 6 4 0 0 0-12 0 M18 13h4 M9 17l-1 3 M15 17l1 3', drone: 'M6 6l12 12 M18 6L6 18 M3 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M15 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  sam: 'M3 20h18 M7 20l5-12 5 12 M12 8V3 M10 5l2-2 2 2', ship: 'M2 15h20l-3 5H5z M6 15v-3h11v3 M10 12V8h4v4 M12 8V4',
};
// equipamiento: precio en millones de USD por lote; suma "poder" que multiplica la calidad de los soldados
const UNITS = {
  rifle: { n: 'Fusiles AK-47', lot: 1000, price: 0.6, days: 7, pow: 0, desc: 'Sin fusil un soldado rinde 25 %' },
  rpg: { n: 'Lanzacohetes RPG-7', lot: 100, price: 1.2, days: 10, pow: 4, desc: 'Antitanque portátil' },
  tank: { n: 'Tanques', lot: 1, price: 6, days: 60, pow: 60, desc: 'Blindado principal' },
  art: { n: 'Artillería', lot: 1, price: 3, days: 45, pow: 30, desc: 'Obús de 155 mm' },
  mlrs: { n: 'Lanzacohetes múltiples', lot: 1, price: 5, days: 60, pow: 50, desc: 'Cohetes de saturación' },
  air: { n: 'Aviones de combate', lot: 1, price: 70, days: 180, pow: 200, desc: 'Caza polivalente' },
  heli: { n: 'Helicópteros', lot: 1, price: 30, days: 120, pow: 70, desc: 'Ataque y apoyo cercano' },
  drone: { n: 'Drones', lot: 10, price: 20, days: 20, pow: 20, desc: 'Drones de ataque' },
  sam: { n: 'Antiaéreos', lot: 1, price: 50, days: 90, pow: 60, desc: 'Misiles (solo defensa)' },
  ship: { n: 'Buques de guerra', lot: 1, price: 600, days: 365, pow: 50, desc: 'Permiten cruzar el mar' },
};
const UK = Object.keys(UNITS);
const TECH = [
  { k: 'rif', n: 'Fusiles modernos', cost: 200, d: 'Tropas +10 % de fuerza', ic: '🔫' },
  { k: 'log', n: 'Logística', cost: 280, d: 'Tropas 40 % más rápidas', ic: '🚚' },
  { k: 'fort', n: 'Fortificaciones', cost: 360, d: '+30 % de defensa en tu territorio', ic: '🧱' },
  { k: 'med', n: 'Medicina', cost: 340, d: 'Calidad de vida y población crecen más', ic: '🏥' },
  { k: 'ind', n: 'Industria', cost: 500, d: 'PBI +1 % por año y compras de a ×100', ic: '🏭' },
  { k: 'arm', n: 'Blindados', cost: 600, req: 'rif', d: 'Tropas +15 % de fuerza', ic: '🛡️' },
  { k: 'avi', n: 'Aviación moderna', cost: 950, req: 'arm', d: 'Tropas +20 % de fuerza', ic: '✈️' },
  { k: 'mis', n: 'Misiles', cost: 1200, req: 'avi', d: 'Lanzá misiles contra escuadrones enemigos', ic: '🚀' },
  { k: 'nuk', n: 'Bomba nuclear', cost: 2800, req: 'mis', d: 'Fabricás bombas de a una y las tirás donde quieras', ic: '☢️' },
];
const IDEO = {
  dem: { n: 'Democracia', growth: .01, atk: 1, def: 1, rec: 1, qolm: 1.2, aggr: .35,
    d: [['pos', 'Libre mercado: crecimiento +1 %'], ['pos', 'Calidad de vida +20 % por peso invertido'], ['neg', 'Opinión pública: declarar guerra baja la estabilidad']] },
  soc: { n: 'Socialismo', growth: 0, atk: 1, def: 1.05, rec: .95, qolm: 1.5, aggr: .6,
    d: [['pos', 'Estado de bienestar: calidad de vida +50 % por peso'], ['pos', 'Defensa +5 %'], ['neg', 'Sin bonus de crecimiento']] },
  com: { n: 'Comunismo', growth: -.01, atk: 1, def: 1.1, rec: .6, qolm: 1, aggr: 1.1,
    d: [['pos', 'Llamado a las armas: las tropas se producen 40 % más rápido'], ['pos', 'Defensa +10 %'], ['neg', 'Estancamiento: crecimiento −1 %']] },
  aut: { n: 'Autoritarismo', growth: 0, atk: 1.1, def: 1.05, rec: .8, qolm: .8, aggr: 1.4,
    d: [['pos', 'Ataque +10 %'], ['pos', 'Tropas 20 % más rápidas de producir'], ['neg', 'Calidad de vida −20 % por peso']] },
  fas: { n: 'Fascismo', growth: -.005, atk: 1.25, def: 1.05, rec: .75, qolm: .7, aggr: 2, rel: -15,
    d: [['pos', 'Militarismo: ataque +25 %'], ['pos', 'Tropas 25 % más rápidas de producir'], ['neg', 'Relaciones con todos −15'], ['neg', 'Crecimiento −0,5 %']] },
  mon: { n: 'Monarquía', growth: 0, atk: 1, def: 1.1, rec: 1, qolm: .9, aggr: .8, stab: 10,
    d: [['pos', 'Estabilidad +10'], ['pos', 'Defensa +10 %'], ['neg', 'Calidad de vida −10 % por peso']] },
  teo: { n: 'Teocracia', growth: -.005, atk: 1, def: 1.25, rec: .9, qolm: .9, aggr: 1, stab: 5,
    d: [['pos', 'Fervor: defensa +25 %'], ['pos', 'Tropas 10 % más rápidas de producir'], ['neg', 'Crecimiento −0,5 %']] },
  ana: { n: 'Anarquismo', growth: 0, atk: .6, def: 1.5, rec: 1.3, qolm: 1.5, aggr: 0,
    d: [['pos', 'Guerrilla: defensa +50 %'], ['pos', 'Autogestión: calidad de vida +50 % por peso'], ['neg', 'Ataque −40 %'], ['neg', 'Las tropas se producen 30 % más lento']] },
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
// G: estado guardable. owner/dmg son arreglos tipados por celda (se codifican al guardar)
let G = null, sel = null, pickSel = null;
let owner = new Uint8Array(NC), dmg = new Float32Array(NC);
const cellGdp = new Float32Array(NC), cellPop = new Float32Array(NC);
const alive = () => Object.keys(G.n);
const SAVE = 'empire.conq3';
const gdppc = k => Q[k].gdp * 1e9 / Math.max(1, Q[k].pop);
function initialEquip(k) {
  const [per, tank, air, art, heli, ship] = Q[k].mil, inf = per * 1000;
  return { rifle: inf, rpg: Math.round(inf / 40), tank, art: Math.round(art * .7), mlrs: Math.round(art * .3), air, heli, drone: air * 2, sam: Math.round(air * .2), ship };
}
function resetCells() {
  owner.fill(255); dmg.fill(0);
  for (let ci = 0; ci < NI; ci++) { const cells = cellsOf[ci], k = PLAYABLE[ci], g = Q[k].gdp / cells.length, p = Q[k].pop / cells.length;
    for (const i of cells) { owner[i] = ci; cellGdp[i] = g; cellPop[i] = p; } }
}
function newGame(me) {
  resetCells();
  const g = { v: 3, me, day: 0, tension: 25, n: {}, reg: [], rel: {}, ally: {}, wars: [], q: [], log: [], sq: [], sqSeq: 0, ae: 0, aeN: {},
    nextEvent: 150 + Math.floor(Math.random() * 120), seen: [], wonShown: false };
  for (const k of PLAYABLE) {
    const pc = gdppc(k), lvl = clamp(15 + 25 * Math.log10(pc / 400), 8, 95), soldiers = Q[k].mil[0] * 1000;
    g.reg[IDX[k]] = { infra: lvl, qol: clamp(lvl - 3, 8, 95) };
    const ideo = IDEO0[k] || 'dem', spend = Q[k].gdp * Q[k].milPct / 100 * 1e9 / Math.max(1, soldiers);
    g.n[k] = { ideo, ideoDay: -999, stab: clamp(30 + lvl * .5 + (ideo === 'dem' ? 0 : 6), 25, 85), treasury: Q[k].gdp * .02, reserve: 0,
      // presupuesto en % del PBI, como sliders: social, investigación, militar, liquidez (ahorro)
      bud: { soc: clamp(8 + lvl / 10, 6, 18), res: clamp(pc / 30000, .3, 3), mil: clamp(Q[k].milPct, .5, 30), liq: 2 },
      eq: initialEquip(k), tech: clamp(.35 + .3 * Math.log10(pc / 1000) + .15 * Math.log10(spend / 1e4), .3, 1.5),
      pm: clamp(Math.pow(pc / 20000, .8), .25, 3.5), techs: {}, rp: 0, line: 0, misDay: -99, relDay: {}, cap: CAPITAL[IDX[k]], soldiers, base: soldiers, nukes: 0, nukeBuild: 0 };
    // escuadrones iniciales: la mitad en la capital, el resto repartido en la frontera más caliente
    const ci = IDX[k], capC = CAPITAL[ci];
    const parts = soldiers > 40000 ? [.5, .25, .25] : soldiers > 8000 ? [.6, .4] : [1];
    parts.forEach((f, j) => {
      let at = capC;
      if (j > 0 && ADJ[ci].length) { const nb = ADJ[ci].map(a => PLAYABLE[a]).sort((a, b) => relBase0(k, a) - relBase0(k, b))[j - 1] || PLAYABLE[ADJ[ci][0]];
        at = nearestCell(cellsOf[ci], cxOf(CAPITAL[IDX[nb]]), cyOf(CAPITAL[IDX[nb]])); }
      g.sq.push({ id: ++g.sqSeq, o: k, x: cxOf(at), y: cyOf(at), px: cxOf(at), py: cyOf(at), n: soldiers * f, tx: null, ty: null });
    });
  }
  ALLY0.forEach(([a, b]) => { if (g.n[a] && g.n[b]) g.ally[pk(a, b)] = 1; });
  // la guerra de Rusia en Ucrania ya está en curso: el este ucraniano arranca ocupado
  g.wars.push({ a: 'ru', b: 'ua', day: 0 });
  const ua = IDX.ua, ruCap = CAPITAL[IDX.ru];
  const ucs = Array.from(cellsOf[ua]).sort((a, b) => wdist([cxOf(a), cyOf(a)], [cxOf(ruCap), cyOf(ruCap)]) - wdist([cxOf(b), cyOf(b)], [cxOf(ruCap), cyOf(ruCap)]));
  ucs.slice(0, Math.round(ucs.length * .18)).forEach(i => (owner[i] = IDX.ru));
  g.n.ua.aid = 1.7; g.n.ua.eq0 = { ...g.n.ua.eq }; g.n.ua.soldiers0 = g.n.ua.soldiers;
  return g;
}
function nearestCell(list, x, y) { let best = list[0], bd = 1e18; for (const i of list) { const d = (cxOf(i) - x) ** 2 + (cyOf(i) - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
const relBase0 = (a, b) => (SP[a + '-' + b] != null ? SP[a + '-' + b] : 50);

/* ======================= AGREGADOS POR PAÍS ======================= */
let agg = null; // { cells, gdp, pop, qol } por dueño (índice)
function updatePeaks() { for (const k of alive()) G.n[k].peak = Math.max(G.n[k].peak || 0, agg.cells[IDX[k]]); }
function recomputeAgg() {
  const cells = new Float64Array(NI), gdp = new Float64Array(NI), pop = new Float64Array(NI), qw = new Float64Array(NI), core = new Float64Array(NI);
  for (const i of LAND) { const o = owner[i]; if (o === 255) continue; cells[o]++; const R = G.reg[cellC[i]];
    gdp[o] += cellGdp[i] * (1 - dmg[i] * .8) * clamp((R.infra + 20) / 100, .2, 1); pop[o] += cellPop[i]; qw[o] += R.qol * cellPop[i]; if (cellC[i] === o) core[o] += cellPop[i]; }
  agg = { cells, gdp, pop, core, qol: Array.from(qw, (v, i) => (pop[i] ? v / pop[i] : 0)) };
}
const gdpOf = k => agg.gdp[IDX[k]];
const popOf = k => agg.pop[IDX[k]];
const avgQol = k => agg.qol[IDX[k]];
// reclutas: la población propia cuenta entera; la conquistada, 25 % (no quiere pelear por vos)
const manpower = k => { const i = IDX[k]; return agg.core[i] + (agg.pop[i] - agg.core[i]) * .25; };
const foreignShare = k => { const i = IDX[k]; return agg.pop[i] ? 1 - agg.core[i] / agg.pop[i] : 0; };
const worldGdp = () => agg.gdp.reduce((s, v) => s + v, 0);
const revenue = k => gdpOf(k) * .1; // escala para eventos

/* ======================= CÁLCULOS ======================= */
const ideoOf = k => IDEO[G.n[k].ideo];
const has = (k, t) => !!G.n[k].techs[t];
// calidad: cuánto rinde cada soldado (equipo, tecnología, moral, gasto militar, investigación)
function quality(k, defending) {
  const n = G.n[k], e = n.eq, I = ideoOf(k), s = Math.max(1, n.soldiers);
  const armed = Math.min(s, e.rifle); let p = armed + (s - armed) * .25 + Math.min(e.rpg, s / 10) * 4;
  for (const t of ['tank', 'art', 'mlrs', 'air', 'heli', 'drone', 'ship']) p += e[t] * UNITS[t].pow;
  if (defending) p += e.sam * UNITS.sam.pow;
  const milFx = clamp(.75 + n.bud.mil / 12, .75, 1.6); // el gasto militar mejora la efectividad, no la cantidad
  const tech = (has(k, 'rif') ? 1.1 : 1) * (has(k, 'arm') ? 1.15 : 1) * (has(k, 'avi') ? 1.2 : 1);
  const mass = s > 2 * (n.base || s) ? (2 * n.base + (s - 2 * n.base) * .5) / s : 1; // más allá del doble del ejército original, conscriptos poco entrenados
  return p / s * mass * n.tech * milFx * tech * (defending ? I.def * (has(k, 'fort') ? 1.3 : 1) : I.atk) * (.5 + n.stab / 200) * (n.aid || 1);
}
const power = (k, def) => G.n[k] ? G.n[k].soldiers * quality(k, def) : 0;
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
let warSet = new Set();
const rebuildWarSet = () => { warSet = new Set(); for (const w of G.wars) { warSet.add(w.a + '|' + w.b); warSet.add(w.b + '|' + w.a); } };
const atWar = (a, b) => warSet.has(a + '|' + b);
const warsOf = k => G.wars.filter(w => w.a === k || w.b === k);
const enemiesOf = k => warsOf(k).map(w => (w.a === k ? w.b : w.a));
const alliesOf = k => alive().filter(o => o !== k && allied(k, o));
// vecinos reales según la grilla (quién toca a quién), y la frontera de cada país
let NB = null, FRONT = null;
function rebuildFrontiers() {
  NB = Array.from({ length: NI }, () => new Set()); FRONT = Array.from({ length: NI }, () => []);
  for (const i of LAND) {
    const o = owner[i]; if (o === 255) continue; const x = i % NX; let edge = false;
    for (const j of [i - 1, i + 1, i - NX, i + NX]) { if (j < 0 || j >= NC || (j === i - 1 && x === 0) || (j === i + 1 && x === NX - 1)) continue;
      const p = owner[j]; if (p !== 255 && p !== o) { NB[o].add(p); edge = true; } else if (p === 255) edge = true; }
    if (edge) FRONT[o].push(i);
  }
  // islas sin vecino terrestre: usar los vecinos marítimos del mapa de datos
  for (let o = 0; o < NI; o++) if (G.n[PLAYABLE[o]] && !NB[o].size) for (const a of ADJ[o]) for (const i of cellsOf[a]) { const p = owner[i]; if (p !== 255 && p !== o) { NB[o].add(p); break; } }
}
const landNeighbors = k => new Set([...NB[IDX[k]]].map(i => PLAYABLE[i]).filter(x => G.n[x]));
const shipsOK = k => G.n[k].eq.ship >= 3;
function capDist(a, b) { const A = G.n[a].cap, B = G.n[b].cap; return wdist([cxOf(A), cyOf(A)], [cxOf(B), cyOf(B)]); }
const canReach = (a, b) => landNeighbors(a).has(b) || (shipsOK(a) && capDist(a, b) < 120 + G.n[a].eq.ship * 2.5);
function threatOf(k) { return [...new Set([...landNeighbors(k), ...enemiesOf(k)])].filter(o => rel(k, o) < 35).reduce((s, o) => s + power(o), 0); }
function strengthParts(k) { return { P: power(k), gdp: gdpOf(k), qol: avgQol(k), allies: alliesOf(k).filter(x => rel(k, x) >= 50).reduce((s, x) => s + power(x), 0), threat: threatOf(k) }; }
function strengthScore(k) { const s = strengthParts(k), mil = s.P + Math.min(s.allies * .2, s.P); return Math.sqrt(mil) * Math.sqrt(s.gdp * 1000) * (.5 + s.qol / 120) / (1 + .6 * s.threat / (s.P + 1)); }
const sqOf = k => G.sq.filter(s => s.o === k);
function syncSoldiers() { for (const k of alive()) G.n[k].soldiers = G.n[k].reserve; for (const s of G.sq) if (G.n[s.o]) G.n[s.o].soldiers += s.n; }

/* ======================= TERRITORIO ======================= */
const maskCache = new Map(); // `${región}|${dueño}` -> {cv, bb}
let multi = new Set(); // regiones con más de un dueño
function rebuildMulti() { multi = new Set(); for (let ci = 0; ci < NI; ci++) { const cells = cellsOf[ci], o0 = owner[cells[0]]; for (const i of cells) if (owner[i] !== o0) { multi.add(ci); break; } } }
function flip(i, to, by) {
  const from = owner[i]; if (from === to) return;
  owner[i] = to; dmg[i] = Math.min(1, dmg[i] + .3);
  const ci = cellC[i]; multi.add(ci); for (const key of [...maskCache.keys()]) if (key.startsWith(ci + '|')) maskCache.delete(key);
  agg.cells[from]--; agg.cells[to]++; dirty = true; G.terrDirty = true;
  const sh = cellGdp[i] / Math.max(1, worldGdp()) * 100; if (PLAYABLE[to] === G.me) G.ae += sh; else G.aeN[PLAYABLE[to]] = (G.aeN[PLAYABLE[to]] || 0) + sh;
  const kf = PLAYABLE[from], nf = G.n[kf]; if (!nf) return;
  if (agg.cells[from] <= 0) return capitulate(kf, PLAYABLE[to]);
  if (i === nf.cap) {
    // cae la capital: si ya perdió más de la mitad, se rinde; si no, el gobierno se muda
    if (agg.cells[from] < (nf.peak || 1) * .5) return capitulate(kf, PLAYABLE[to]);
    const rest = LAND.filter(j => owner[j] === from); // la nueva capital: el punto propio más lejos del frente
    nf.cap = rest.reduce((b, j) => (Math.hypot(cxOf(j) - cxOf(i), cyOf(j) - cyOf(i)) > Math.hypot(cxOf(b) - cxOf(i), cyOf(b) - cyOf(i)) ? j : b), rest[0]);
    news(`🏛️ Cayó la capital de ${name(kf)}: el gobierno se muda y sigue la guerra`, '', kf === G.me || PLAYABLE[to] === G.me);
  }
}
function capitulate(k, by) {
  if (!G.n[k] || !G.n[by]) return;
  const ki = IDX[k], bi = IDX[by];
  for (const i of LAND) if (owner[i] === ki) { owner[i] = bi; dmg[i] = Math.min(1, dmg[i] + .15); }
  maskCache.clear(); rebuildMulti();
  const e = G.n[k].eq, w = G.n[by].eq; for (const t of ['tank', 'art', 'mlrs', 'heli', 'rifle']) w[t] += Math.round(e[t] * .25);
  G.n[by].treasury += Math.max(0, G.n[k].treasury) * .5;
  delete G.n[k]; G.sq = G.sq.filter(s => s.o !== k); G.wars = G.wars.filter(x => x.a !== k && x.b !== k); rebuildWarSet();
  Object.keys(G.ally).forEach(p => { if (p.split('|').includes(k)) delete G.ally[p]; });
  if (sel === k) sel = null;
  recomputeAgg(); rebuildFrontiers(); dirty = true;
  news(`🏳️ ${name(k)} capituló ante ${name(by)}`, by === G.me ? 'good' : '', true);
  if (k === G.me) { G.dead = by; selected.clear(); setSpeed(0); showDefeat(by); return; }
  if (alive().length === 1) { setSpeed(0); showVictory(alive()[0]); }
}

/* ======================= GUERRA Y DIPLOMACIA ======================= */
function news(msg, cls = '', mine = false) { G.log.unshift({ d: G.day, msg }); G.log.length = Math.min(G.log.length, 60); if (mine) pushNews(msg, cls); }
function declareWar(a, b, depth = 0) {
  if (a === b || atWar(a, b) || !G.n[a] || !G.n[b]) return;
  if (allied(a, b)) delete G.ally[pk(a, b)];
  G.wars.push({ a, b, day: G.day }); rebuildWarSet();
  G.tension = clamp(G.tension + 1.5, 0, 100);
  addRel(a, b, -60);
  alive().forEach(o => { if (o !== a && o !== b && rel(o, b) >= 70) addRel(o, a, -10); });
  if (a === G.me && G.n[a].ideo === 'dem') G.n[a].stab = clamp(G.n[a].stab - 8, 0, 100);
  const mine = a === G.me || b === G.me, big = power(a) > 1e6 || power(b) > 1e6;
  news(`⚔️ ${name(a)} declaró la guerra a ${name(b)}`, mine ? '' : 'info', mine || big);
  if (depth > 1) return;
  for (const x of alliesOf(b)) {
    if (x === a || atWar(x, a) || rel(x, b) < 50 || allied(x, a)) continue;
    if (x === G.me) askHelp(b, a);
    else if (canReach(x, a) && Math.random() < rel(x, b) / 140) { declareWar(x, a, depth + 1); news(`🛡️ ${name(x)} entra en la guerra para defender a ${name(b)}`, '', b === G.me || a === G.me); }
  }
}
function makePeace(a, b) {
  G.wars = G.wars.filter(w => !((w.a === a && w.b === b) || (w.a === b && w.b === a))); rebuildWarSet();
  addRel(a, b, 25); G.tension = clamp(G.tension - 1, 0, 100);
  // cada uno se queda con lo que ocupa; los escuadrones que quedaron del otro lado vuelven
  for (const s of G.sq) if ((s.o === a || s.o === b)) { const o = owner[cellAt(s.x, s.y)]; if (o !== 255 && PLAYABLE[o] !== s.o && (PLAYABLE[o] === a || PLAYABLE[o] === b)) sendHome(s); }
  news(`🕊️ Paz entre ${name(a)} y ${name(b)}`, 'good', a === G.me || b === G.me); dirty = true;
}
function sendHome(s) { const c = G.n[s.o].cap; s.tx = cxOf(c); s.ty = cyOf(c); s.auto = false; }

/* ======================= ESCUADRONES ======================= */
const ENG = 7; // distancia de combate
const speedOf = s => 2.4 * (has(s.o, 'log') ? 1.4 : 1);
function crossesSea(x0, y0, x1, y1) { // ¿la línea pasa por más de ~4 celdas de agua seguidas?
  const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(L / CS); let run = 0;
  for (let t = 0; t <= steps; t++) { const i = cellAt(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps); if (i < 0 || owner[i] === 255) { if (++run > 4) return true; } else run = 0; }
  return false;
}
function strengthAt(s) { const o = owner[cellAt(s.x, s.y)]; return s.n * quality(s.o, o !== 255 && PLAYABLE[o] === s.o); }
function moveSquads() {
  for (const s of G.sq) {
    s.px = s.x; s.py = s.y;
    if (s.eng || s.tx == null) continue;
    const dx = s.tx - s.x, dy = s.ty - s.y, L = Math.hypot(dx, dy), i = cellAt(s.x, s.y);
    const sp = speedOf(s) * (i < 0 || owner[i] === 255 ? .7 : 1);
    if (L <= sp) { s.x = s.tx; s.y = s.ty; s.tx = s.ty = null; } else { s.x += dx / L * sp; s.y += dy / L * sp; }
  }
}
function combat() {
  for (const s of G.sq) s.eng = false;
  const act = G.sq.filter(s => enemiesOf(s.o).length);
  const loss = new Map();
  for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
    const A = act[a], B = act[b]; if (!atWar(A.o, B.o)) continue;
    if (Math.abs(A.x - B.x) > ENG || Math.abs(A.y - B.y) > ENG || Math.hypot(A.x - B.x, A.y - B.y) > ENG) continue;
    A.eng = B.eng = true;
    const sa = strengthAt(A), sb = strengthAt(B);
    // cada día cada bando pierde soldados según la fuerza del rival
    loss.set(A, (loss.get(A) || 0) + .012 * sb / Math.max(.05, quality(A.o)));
    loss.set(B, (loss.get(B) || 0) + .012 * sa / Math.max(.05, quality(B.o)));
  }
  for (const [s, l] of loss) {
    const lost = Math.min(s.n, l); s.n -= lost;
    const n = G.n[s.o]; if (n) { const f = lost / Math.max(1, n.soldiers); for (const t of UK) n.eq[t] = Math.max(0, n.eq[t] * (1 - f * .5)); }
    if (s.o === G.me && s.n < 1) pushNews(`💀 Un escuadrón tuyo fue destruido`, '');
  }
  G.sq = G.sq.filter(s => s.n >= 1);
}
function annex() {
  for (const s of G.sq) {
    if (s.eng || !G.n[s.o]) continue;
    const en = enemiesOf(s.o); if (!en.length) continue;
    const enI = new Set(en.map(e => IDX[e])), to = IDX[s.o];
    const R = Math.min(8, 2 + Math.sqrt(s.n / 6000)), F = clamp(Math.round(1 + Math.sqrt(s.n / 4000)), 1, 14);
    const gx = Math.floor(s.x / CS), gy = Math.floor(s.y / CS), r = Math.ceil(R), cand = [];
    for (let y = gy - r; y <= gy + r; y++) for (let x = gx - r; x <= gx + r; x++) {
      if (x < 0 || y < 0 || x >= NX || y >= NY) continue; const d = (x - gx) ** 2 + (y - gy) ** 2; if (d > R * R) continue;
      const i = y * NX + x; if (enI.has(owner[i])) cand.push([d, i]);
    }
    if (!cand.length) continue;
    // resistencia: la guarnición y la milicia del país atacado frenan la anexión
    const def = PLAYABLE[owner[cand[0][1]]], att = strengthAt(s), gar = (G.n[def] ? power(def, true) : 0) * .35 / Math.sqrt(Math.max(1, agg.cells[owner[cand[0][1]]]) / 40);
    const rate = F * clamp(att / (att + gar), .05, 1);
    s.acc = (s.acc || 0) + rate; const nflip = Math.floor(s.acc); s.acc -= nflip;
    cand.sort((a, b) => a[0] - b[0]);
    for (let j = 0; j < Math.min(nflip, cand.length); j++) { if (!G.n[s.o]) break; flip(cand[j][1], to); }
  }
}
function produce() { // producción pasiva de tropas desde el presupuesto militar, con tope de población
  for (const k of alive()) {
    const n = G.n[k], milB = gdpOf(k) * n.bud.mil / 100; // B$/año
    const upkeep = n.soldiers * 6e-5 * n.pm; // B$/año
    const free = Math.max(0, milB - upkeep), cost = 3e-5 * n.pm * ideoOf(k).rec; // B$ por soldado
    const war = warsOf(k).length > 0, mp = manpower(k), cap = mp * (war ? .015 : .008);
    // cuarteles: como mucho 0,06 % de los reclutas posibles por año en paz (0,15 % en guerra)
    let add = Math.min(cap - n.soldiers, free / 365 / cost * .2, mp * (war ? .0015 : .0006) / 365);
    if (k !== G.me && !war) add = Math.min(add, (n.base || n.soldiers) * 1.3 - n.soldiers); // la IA no se arma sin motivo
    if (add > 0) n.reserve += add;
    if (milB < upkeep) { for (const s of sqOf(k)) s.n *= .9995; n.stab = Math.max(0, n.stab - .02); } // tropas sin paga desertan
  }
}
function deploy(k) { // la reserva sale de la capital como escuadrón
  const n = G.n[k]; if (n.reserve < 500) return;
  const c = n.cap, x = cxOf(c), y = cyOf(c);
  const near = sqOf(k).find(s => s.tx == null && Math.hypot(s.x - x, s.y - y) < 6);
  if (near) near.n += n.reserve; else G.sq.push({ id: ++G.sqSeq, o: k, x, y, px: x, py: y, n: n.reserve, tx: null, ty: null });
  n.reserve = 0;
}
function nearestEnemyFront(s) {
  let best = null, bd = 1e18;
  for (const e of enemiesOf(s.o)) {
    const F = FRONT[IDX[e]]; if (!F) continue;
    for (let j = 0; j < F.length; j += F.length > 600 ? 3 : 1) { const i = F[j], d = (cxOf(i) - s.x) ** 2 + (cyOf(i) - s.y) ** 2; if (d < bd) { bd = d; best = i; } }
  }
  return best;
}
function autoTarget(s) { // avanzar sobre el enemigo más cercano
  const c = nearestEnemyFront(s); if (c == null) return false;
  const reachable = !crossesSea(s.x, s.y, cxOf(c), cyOf(c)) || shipsOK(s.o);
  if (!reachable) return false;
  s.tx = cxOf(c); s.ty = cyOf(c); return true;
}

/* ======================= SIMULACIÓN ======================= */
function unitCost(type) { return UNITS[type].price / 1000; }
function buy(k, type, lots, dry = false) {
  const n = G.n[k], U = UNITS[type], cost = unitCost(type) * lots;
  if (cost > n.treasury + 1e-9) return { ok: false, msg: `Falta plata en el tesoro (cuesta ${money(cost)})` };
  const fac = gdpOf(k) * .012 * (warsOf(k).length ? 2 : 1), start = Math.max(G.day, n.line), days = cost / (fac / 365);
  if (start - G.day > 540) return { ok: false, msg: 'Las fábricas están saturadas por más de un año y medio' };
  const arr = Math.round(start + Math.max(U.days, days));
  if (dry) return { ok: true, arr };
  n.treasury -= cost; n.line = start + days; G.q.push({ k, t: type, n: U.lot * lots, day: arr });
  return { ok: true, arr };
}
function recruitCost(k, men) { return men * 3e-5 * G.n[k].pm * ideoOf(k).rec * 2; }
function dayTick() {
  G.day++;
  for (const k of alive()) {
    const n = G.n[k], gdp = gdpOf(k), b = n.bud, I = ideoOf(k), total = b.soc + b.res + b.mil + b.liq;
    n.treasury += gdp * b.liq / 100 / 365;
    n.rp += Math.sqrt(Math.max(0, gdp * b.res / 100)) * .3; // puntos de investigación por día
    // gasto social: calidad de vida y estabilidad
    const qGain = (b.soc - 7) * .004 * I.qolm * (has(k, 'med') ? 1.3 : 1);
    n.qolDrift = qGain;
    n.stab += (40 + avgQol(k) * .5 + (I.stab || 0) - warsOf(k).length * 6 - foreignShare(k) * 35 - n.stab) * .004;
    // crecimiento: gastar mucho en todo lo frena (como un Estado que se endeuda)
    n.growth = .02 + I.growth + (has(k, 'ind') ? .01 : 0) - Math.max(0, total - 22) * .002 - (warsOf(k).length ? .015 : 0) - (gdppc(k) > 30000 ? .008 : 0);
  }
  if (G.day % 5 === 0) { // economía por celda (cada 5 días para no recorrer todo siempre)
    for (const i of LAND) { const o = owner[i]; if (o === 255) continue; const n = G.n[PLAYABLE[o]]; if (!n) continue;
      cellGdp[i] *= 1 + n.growth * 5 / 365; if (dmg[i] > 0) dmg[i] = Math.max(0, dmg[i] - .006 * 5); cellPop[i] *= 1 + (.004 + (has(PLAYABLE[o], 'med') ? .004 : 0)) * 5 / 365; }
    for (let ci = 0; ci < NI; ci++) { const o = PLAYABLE[owner[CAPITAL[ci]]] || null; const n = o && G.n[o]; const R = G.reg[ci];
      R.qol = clamp(R.qol + (n ? n.qolDrift * 5 : -.1), 3, 100); R.infra = clamp(R.infra + (n ? (n.bud.soc - 6) * .0015 * 5 : 0) - .02, 3, 100); }
    recomputeAgg();
  }
  for (let i = G.q.length - 1; i >= 0; i--) { const o = G.q[i]; if (o.day <= G.day) { if (G.n[o.k]) G.n[o.k].eq[o.t] += o.n; G.q.splice(i, 1);
    if (o.k === G.me) pushNews(`📦 Llegaron ${fmtInt(o.n)} ${UNITS[o.t].n.toLowerCase()}`, 'good'); } }
  for (const k of alive()) { const n = G.n[k]; if (n.nukeBuild && G.day >= n.nukeBuild) { n.nukes++; n.nukeBuild = 0; if (k === G.me) { pushNews('☢️ Una bomba nuclear está lista', 'good'); updateNukeBtn(); } } }
  produce();
  if (G.day % 15 === 0) alive().forEach(deploy);
  moveSquads(); combat(); annex(); syncSoldiers();
  if (G.day % 5 === 0 || G.terrDirty) { rebuildFrontiers(); G.terrDirty = false; }
  for (const s of G.sq) if (s.auto && s.tx == null && !s.eng) autoTarget(s);
  for (const k of alive()) if (k !== G.me && (G.day + IDX[k]) % 5 === 0) aiSquads(k);
  G.tension = clamp(G.tension + .015, 0, 100);
  if (G.day % 30 === 0) monthTick();
  if (G.n[G.me] && G.day >= G.nextEvent) { G.nextEvent = G.day + 300 + Math.floor(Math.random() * 130); randomEvent(); }
  if (G.n[G.me] && !G.wonShown && gdpOf(G.me) >= worldGdp() * .5) { G.wonShown = true; showWin50(); }
}
function monthTick() {
  Object.keys(G.rel).forEach(k => { G.rel[k] *= .985; });
  for (const k of alive()) {
    const n = G.n[k];
    if (n.aid > 1) { const f = .05 * (n.aid - 1) / .7; for (const t of UK) n.eq[t] += n.eq0[t] * f; n.reserve += n.soldiers0 * f * .5; n.aid = Math.max(1, n.aid - .01); }
    // investigación: la IA desbloquea en orden; el jugador elige
    if (k !== G.me) { const t = TECH.find(t => !n.techs[t.k] && (!t.req || n.techs[t.req])); if (t && n.rp >= t.cost) { n.rp -= t.cost; n.techs[t.k] = 1; } }
  }
  updatePeaks();
  for (const k of alive()) if (k !== G.me) ai(k);
  coalition(); aiCoalitions();
  G.ae *= .88;
  autosave();
}
function aiCoalitions() { // una potencia que conquista rápido asusta a sus vecinos
  for (const k of Object.keys(G.aeN || {})) {
    G.aeN[k] *= .88; if (!G.n[k] || G.aeN[k] < 1) continue;
    let n = 0; for (const o of alive()) if (o !== k && o !== G.me && !atWar(o, k) && !allied(o, k) && rel(o, k) < 55 && canReach(o, k) && Math.random() < .3) { declareWar(o, k, 2); n++; }
    alive().forEach(o => o !== k && addRel(o, k, -4));
    if (n) { G.aeN[k] *= .5; news(`🤝 Coalición de ${n} países contra ${name(k)} por su expansión`, 'info', power(k) > 1e6); }
  }
}
// expandirse rápido arma una coalición en tu contra
function coalition() {
  if (!G.n[G.me] || G.ae < 1.2) return;
  const cands = alive().filter(o => o !== G.me && !atWar(o, G.me) && !allied(o, G.me) && rel(o, G.me) < 55 && canReach(o, G.me));
  let n = 0; for (const o of cands) if (Math.random() < .35) { declareWar(o, G.me, 2); n++; }
  alive().forEach(o => o !== G.me && addRel(o, G.me, -4));
  if (n) { G.ae *= .5; modal(`<div class="event-tag">⚠️ COALICIÓN</div><h2>El mundo se une contra vos</h2><p>Tu expansión asustó a tus vecinos: ${n} país${n > 1 ? 'es' : ''} te declararon la guerra. Conquistar muy rápido arma coaliciones.</p><div class="acts"><button class="btn primary" data-ok>A LAS ARMAS</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = close; }); }
}
function ai(k) {
  const n = G.n[k], I = ideoOf(k), wars = warsOf(k);
  n.bud.mil = wars.length ? Math.max(n.bud.mil, Math.min(25, Q[k].milPct * 2 + 3)) : clamp(Q[k].milPct, .5, 30);
  // equipamiento con el ahorro
  const spend = n.treasury * (wars.length ? .3 : .05);
  if (spend > .01) for (const [t, f] of Object.entries({ tank: .3, art: .15, air: .3, drone: .1, heli: .1, rifle: .05 })) { const lots = Math.floor(spend * f / unitCost(t)); if (lots > 0) buy(k, t, lots); }
  if (n.eq.rifle < n.soldiers) buy(k, 'rifle', Math.ceil((n.soldiers - n.eq.rifle) / 1000));
  // paz si va perdiendo hace rato
  for (const w of wars) {
    const other = w.a === k ? w.b : w.a, ratio = power(k, true) / Math.max(1, power(other));
    if (ratio < .5 && G.day - w.day > 150 && Math.random() < .2) { if (other === G.me) askPeace(k); else makePeace(k, other); }
    else if (other !== G.me && G.day - w.day > 700 && Math.random() < .1) makePeace(k, other);
  }
  if (n.techs.nuk && wars.length && !n.nukeBuild && n.nukes < 3 && n.treasury > nukeCost(k)) { n.treasury -= nukeCost(k); n.nukeBuild = G.day + 365; }
  if (n.nukes) for (const w of wars) { const e = w.a === k ? w.b : w.a; if (G.n[e] && power(k, true) < power(e) * .7 && Math.random() < .3) { n.nukes--; const c = G.n[e].cap; detonate(k, cxOf(c), cyOf(c)); break; } }
  if (wars.length >= 2 || !I.aggr) return;
  const thr = 12 + G.tension * .35, myP = power(k);
  let best = null;
  for (const o of alive()) {
    if (o === k || allied(k, o) || atWar(k, o) || !canReach(k, o)) continue;
    const r = rel(k, o); if (r > thr) continue;
    const helpers = alliesOf(o).filter(x => rel(x, o) >= 50 && x !== k).reduce((s, x) => s + power(x) * .4, 0);
    if (myP > 1.5 * (power(o, true) + helpers) && (!best || r < best[1])) best = [o, r];
  }
  if (best && Math.random() < .02 * I.aggr * (.5 + G.tension / 50)) declareWar(k, best[0]);
  if (Math.random() < .03) for (const o of landNeighbors(k)) if (o !== G.me && !allied(k, o) && rel(k, o) >= 85) { G.ally[pk(k, o)] = 1; break; }
}
function aiSquads(k) { // la IA mueve sus escuadrones: ataca con los grandes, defiende con uno
  const mine = sqOf(k); if (!mine.length) return;
  const n = G.n[k], cap = n.cap, cx = cxOf(cap), cy = cyOf(cap);
  if (!enemiesOf(k).length) { for (const s of mine) if (s.tx == null && Math.hypot(s.x - cx, s.y - cy) > 40 && owner[cellAt(s.x, s.y)] !== IDX[k]) sendHome(s); return; }
  mine.sort((a, b) => b.n - a.n);
  // ¿hay enemigos dentro de mi territorio? el escuadrón más cercano va a pelear
  const intruders = G.sq.filter(s => atWar(s.o, k) && owner[cellAt(s.x, s.y)] === IDX[k]);
  const home = mine.length > 1 ? mine[mine.length - 1] : null;
  if (intruders.length) { const t = intruders[0], d = mine.reduce((b, s) => (Math.hypot(s.x - t.x, s.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y) ? s : b)); d.tx = t.x; d.ty = t.y; d.auto = false; }
  else if (home && Math.hypot(home.x - cx, home.y - cy) > 10) { home.tx = cx; home.ty = cy; }
  for (const s of mine) if (s !== home && !s.eng && (s.tx == null || Math.random() < .3)) autoTarget(s);
  if (mine.length < 4 && mine[0].n > 60000) { const s = mine[0]; s.n /= 2; G.sq.push({ ...s, id: ++G.sqSeq, tx: null, ty: null }); } // abrir otro frente
}
function autosave() { if (!G || !G.n[G.me]) return; try { localStorage.setItem(SAVE, JSON.stringify({ ...G, owner: rle(owner), dmg: Array.from(dmg, v => Math.round(v * 9)).join(''), gdp: Array.from(LAND, i => +cellGdp[i].toPrecision(4)) })); } catch {} }
function rle(a) { const out = []; let v = a[0], c = 0; for (let i = 0; i <= a.length; i++) { if (i < a.length && a[i] === v) c++; else { out.push(v, c); v = a[i]; c = 1; } } return out; }
function loadGame(s) {
  resetCells(); let p = 0; for (let j = 0; j < s.owner.length; j += 2) { owner.fill(s.owner[j], p, p + s.owner[j + 1]); p += s.owner[j + 1]; }
  s.dmg.split('').forEach((ch, i) => (dmg[i] = (+ch || 0) / 9)); if (s.gdp) LAND.forEach((i, j) => (cellGdp[i] = s.gdp[j]));
  delete s.owner; delete s.dmg; delete s.gdp; return s;
}

/* ======================= DECISIÓN ANUAL ======================= */
const me_ = () => G.n[G.me];
const addTre = f => { me_().treasury += revenue(G.me) * f; };
const addStab = d => { me_().stab = clamp(me_().stab + d, 0, 100); };
const myCells = () => LAND.filter(i => owner[i] === IDX[G.me]);
const addGdp = f => { for (const i of myCells()) cellGdp[i] *= 1 + f; recomputeAgg(); };
const myRegions = () => [...new Set(Array.from(myCells(), i => cellC[i]))];
const addQol = d => myRegions().forEach(ci => (G.reg[ci].qol = clamp(G.reg[ci].qol + d, 3, 100)));
const addInfra = d => myRegions().forEach(ci => (G.reg[ci].infra = clamp(G.reg[ci].infra + d, 3, 100)));
const addTroops = f => sqOf(G.me).forEach(s => (s.n *= 1 + f));
const relAll = d => alive().forEach(o => o !== G.me && addRel(G.me, o, d));
const rival = () => alive().filter(o => o !== G.me).sort((a, b) => rel(G.me, a) - rel(G.me, b))[0];
const neighborHostile = () => [...landNeighbors(G.me)].filter(o => !allied(G.me, o)).sort((a, b) => rel(G.me, a) - rel(G.me, b))[0] || rival();
const EVENTS = [
  () => ({ t: '🛢️ Descubren un yacimiento de petróleo', d: 'Geólogos encontraron una reserva enorme en el interior del país.', o: [
    ['Explotarlo a fondo', 'Tesoro +6 % del PBI · calidad de vida −4', () => { addTre(.6); addQol(-4); }],
    ['Declararlo reserva natural', 'Estabilidad +6 · PBI +1 % por turismo', () => { addStab(6); addGdp(.01); }]] }),
  () => ({ t: '🦠 Una pandemia llega al país', d: 'Los hospitales se están llenando y la gente pide medidas.', o: [
    ['Cuarentena estricta', 'PBI −4 % · estabilidad +4', () => { addGdp(-.04); addStab(4); }],
    ['Seguir abiertos', 'Estabilidad −10 · calidad de vida −6', () => { addStab(-10); addQol(-6); }]] }),
  () => ({ t: '🎖️ Intento de golpe de Estado', d: 'Un grupo de coroneles intentó tomar la casa de gobierno. Fracasó, por ahora.', o: [
    ['Purga en el ejército', 'Tropas −8 % · estabilidad +10', () => { addTroops(-.08); addStab(10); }],
    ['Amnistía y diálogo', 'Estabilidad −8 · relaciones +3 con todos', () => { addStab(-8); relAll(3); }]] }),
  () => ({ t: '📉 Crisis financiera mundial', d: 'Las bolsas se desploman y tu moneda pierde valor.', o: [
    ['Rescatar a los bancos', 'Tesoro −4 % del PBI · estabilidad +3', () => { addTre(-.4); addStab(3); }],
    ['Ajuste fiscal', 'PBI −3 % · estabilidad −7 · tesoro +2 % del PBI', () => { addGdp(-.03); addStab(-7); addTre(.2); }]] }),
  () => ({ t: '🌋 Un terremoto sacude el país', d: 'Varias ciudades quedaron dañadas.', o: [
    ['Reconstrucción total', 'Tesoro −3 % del PBI · nada se rompe', () => addTre(-.3)],
    ['Pedir ayuda internacional', 'Infraestructura −10 · relaciones +5 con todos', () => { addInfra(-10); relAll(5); }]] }),
  () => ({ t: '💸 Un multimillonario quiere donar su fortuna', d: 'A cambio pide que una autopista lleve su nombre.', o: [
    ['Aceptar', 'Tesoro +3,5 % del PBI · estabilidad −3', () => { addTre(.35); addStab(-3); }],
    ['Rechazar con dignidad', 'Estabilidad +4', () => addStab(4)]] }),
  () => ({ t: '🛸 Ovnis sobrevuelan la capital', d: 'Miles de personas lo filmaron. Nadie sabe qué es.', o: [
    ['Investigarlo en secreto', 'Tesoro −1 % del PBI. Puede que haya tecnología…', () => { addTre(-.1); if (Math.random() < .5) { me_().rp += 300; pushNews('🛸 ¡Los científicos copiaron tecnología! +300 puntos de investigación', 'good'); } else pushNews('🛸 Eran globos meteorológicos', 'info'); }],
    ['Decir que eran globos', 'Nada pasa (o eso creés)', () => {}]] }),
  () => { const v = neighborHostile(); return { t: `📱 Un influencer pide invadir ${name(v)}`, d: `Tiene 40 millones de seguidores y #Invadir${name(v).replace(/\s/g, '')} es tendencia.`, o: [
    ['Hacerle caso', `Guerra contra ${name(v)} · estabilidad +8`, () => { declareWar(G.me, v); addStab(8); }],
    ['Ignorarlo', 'Estabilidad −3', () => addStab(-3)]] }; },
  () => ({ t: '☄️ Cae un meteorito en el desierto', d: 'Es del tamaño de un auto y está hecho de un metal raro.', o: [
    ['Venderlo a coleccionistas', 'Tesoro +2,5 % del PBI', () => addTre(.25)],
    ['Museo nacional', 'Estabilidad +5 · calidad de vida +2', () => { addStab(5); addQol(2); }]] }),
  () => ({ t: '✊ Huelga general', d: 'Los sindicatos paralizaron el país pidiendo aumentos.', o: [
    ['Dar el aumento', 'Tesoro −3 % del PBI · calidad de vida +5', () => { addTre(-.3); addQol(5); }],
    ['Reprimir', 'Estabilidad −12 · relaciones con las democracias −5', () => { addStab(-12); alive().forEach(o => G.n[o].ideo === 'dem' && o !== G.me && addRel(G.me, o, -5)); }]] }),
  () => { const r = rival(); return { t: `🕵️ Capturan a un espía de ${name(r)}`, d: 'Estaba fotografiando bases militares.', o: [
    ['Intercambiarlo en secreto', `Relación con ${name(r)} +12`, () => addRel(G.me, r, 12)],
    ['Juicio público', `Relación con ${name(r)} −15 · estabilidad +5`, () => { addRel(G.me, r, -15); addStab(5); }]] }; },
  () => ({ t: '🧳 Ola de refugiados en la frontera', d: 'Cientos de miles de personas escapan de una guerra cercana.', o: [
    ['Recibirlos', 'Población +2 % · estabilidad −4 · relaciones +4', () => { for (const i of myCells()) cellPop[i] *= 1.02; recomputeAgg(); addStab(-4); relAll(4); }],
    ['Cerrar la frontera', 'Relaciones con los vecinos −8', () => landNeighbors(G.me).forEach(o => addRel(G.me, o, -8))]] }),
  () => ({ t: '🔬 Avance científico nacional', d: 'Tus universidades lograron un descubrimiento clave.', o: [
    ['Uso militar', '+400 puntos de investigación', () => { me_().rp += 400; }],
    ['Uso civil', 'PBI +3 %', () => addGdp(.03)]] }),
  () => ({ t: '⚽ Te ofrecen organizar el Mundial', d: 'Hay que construir estadios en tiempo récord.', o: [
    ['¡Organizarlo!', 'Tesoro −3,5 % del PBI · estabilidad +10 · infraestructura +5', () => { addTre(-.35); addStab(10); addInfra(5); }],
    ['Rechazarlo', 'Estabilidad −2', () => addStab(-2)]] }),
  () => ({ t: '💼 Escándalo de corrupción', d: 'Filtraron audios de tu ministro de Economía pidiendo coimas.', o: [
    ['Echar a todo el gabinete', 'Estabilidad −5', () => addStab(-5)],
    ['Taparlo', '50 %: no pasa nada · 50 %: estabilidad −18', () => { if (Math.random() < .5) { addStab(-18); pushNews('📰 Se supo todo: estabilidad −18', ''); } }]] }),
  () => ({ t: '🌾 Sequía histórica', d: 'Las cosechas se perdieron y sube el precio de la comida.', o: [
    ['Importar comida', 'Tesoro −2,5 % del PBI', () => addTre(-.25)],
    ['Racionar', 'Estabilidad −8 · calidad de vida −4', () => { addStab(-8); addQol(-4); }]] }),
  () => { const s = pick(['us', 'ru', 'cn', 'fr', 'gb', 'tr', 'il', 'kr'].filter(x => G.n[x] && x !== G.me)) || rival(); return { t: `📦 Oferta secreta de armas de ${name(s)}`, d: 'Ofrecen 80 tanques usados a mitad de precio, entrega inmediata.', o: [
    ['Comprarlos', `Tesoro −${money(.24)} · tanques +80`, () => { const n = me_(); if (n.treasury >= .24) { n.treasury -= .24; n.eq.tank += 80; addRel(G.me, s, 5); } else pushNews('No alcanzó el tesoro para pagarlos', ''); }],
    ['Rechazar', `Relación con ${name(s)} −3`, () => addRel(G.me, s, -3)]] }; },
  () => ({ t: '🫥 El presidente desapareció tres días', d: 'Volvió bronceado y dice que estaba "trabajando en un proyecto".', o: [
    ['Decir que estaba de vacaciones', 'Estabilidad −4', () => addStab(-4)],
    ['Inventar una cumbre secreta', 'Estabilidad +3 · tensión mundial +3', () => { addStab(3); G.tension = clamp(G.tension + 3, 0, 100); }]] }),
  () => { const r = rival(); return { t: `💻 Hackeo masivo desde ${name(r)}`, d: 'Se cayeron los bancos y la red eléctrica durante un día.', o: [
    ['Contraataque cibernético', `Relación con ${name(r)} −12 · +150 de investigación`, () => { addRel(G.me, r, -12); me_().rp += 150; }],
    ['Reforzar defensas', 'Tesoro −1,5 % del PBI', () => addTre(-.15)]] }; },
  () => ({ t: '🗺️ Movimiento independentista', d: 'Una provincia vota en un referéndum ilegal para separarse.', o: [
    ['Dar autonomía', 'PBI −2 % · estabilidad +6', () => { addGdp(-.02); addStab(6); }],
    ['Mano dura', 'Estabilidad −10 · tropas −2 %', () => { addStab(-10); addTroops(-.02); }]] }),
  () => ({ t: '🏖️ Boom turístico', d: 'Tu país se puso de moda en las redes.', o: [
    ['Invertir en hoteles y rutas', 'Infraestructura +6 · tesoro −1 % del PBI', () => { addInfra(6); addTre(-.1); }],
    ['Cobrar impuestos a los turistas', 'Tesoro +2,5 % del PBI', () => addTre(.25)]] }),
  () => ({ t: '🕊️ Cumbre mundial de paz', d: 'Te invitan a firmar un acuerdo para bajar la tensión.', o: [
    ['Firmarlo', 'Tensión mundial −8 · relaciones +5 con todos', () => { G.tension = clamp(G.tension - 8, 0, 100); relAll(5); }],
    ['Boicotear la cumbre', 'Tensión +5 · estabilidad +4', () => { G.tension = clamp(G.tension + 5, 0, 100); addStab(4); }]] }),
  () => ({ t: '🐧 Un pingüino ganó la intendencia de un pueblo', d: 'Fue candidato en broma y sacó el 61 % de los votos.', o: [
    ['Respetar la democracia', 'Estabilidad +5 · el mundo te mira con simpatía', () => { addStab(5); relAll(2); }],
    ['Anular la elección', 'Estabilidad −4', () => addStab(-4)]] }),
  () => ({ t: '🎵 Descubren que el himno nacional es un plagio', d: 'Un musicólogo demostró que es igual a un canto de cancha de 1912.', o: [
    ['Componer un himno nuevo', 'Tesoro −0,5 % del PBI · estabilidad −2', () => { addTre(-.05); addStab(-2); }],
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

/* ======================= RENDER ======================= */
const mapCv = $('map'), ctx = mapCv.getContext('2d'), baseCv = document.createElement('canvas'), bctx = baseCv.getContext('2d');
const tmpCv = document.createElement('canvas'), tctx = tmpCv.getContext('2d');
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
const toScreen = (x, y) => [(x - cam.x) * cam.s + vw / 2, (y - cam.y) * cam.s + vh / 2];
const setT = c => { const k = cam.s * dpr; c.setTransform(k, 0, 0, k, (vw / 2 - cam.x * cam.s) * dpr, (vh / 2 - cam.y * cam.s) * dpr); };
// máscara de los puntos de una región que pertenecen a un dueño
function maskOf(ci, o) {
  const key = ci + '|' + o; if (maskCache.has(key)) return maskCache.get(key);
  const b = RBB[ci], gx0 = Math.max(0, Math.floor(b[0] / CS)), gy0 = Math.max(0, Math.floor(b[1] / CS)), gx1 = Math.min(NX - 1, Math.ceil(b[2] / CS)), gy1 = Math.min(NY - 1, Math.ceil(b[3] / CS));
  const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
  const c = cv.getContext('2d'), im = c.createImageData(gw, gh); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const i of cellsOf[ci]) if (owner[i] === o) { const x = i % NX - gx0, y = Math.floor(i / NX) - gy0; im.data[(y * gw + x) * 4 + 3] = 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  c.putImageData(im, 0, 0);
  const m = { cv, wb: [gx0 * CS, gy0 * CS, (gx1 + 1) * CS, (gy1 + 1) * CS], ob: [(gx0 + x0) * CS, (gy0 + y0) * CS, (gx0 + x1 + 1) * CS, (gy0 + y1 + 1) * CS] };
  maskCache.set(key, m); return m;
}
function drawFlagIn(c, k, bb, center) { const sw = (bb[2] - bb[0]) * cam.s, img = sw > 260 ? midFlag(k) : flagLo[k]; if (img) c.drawImage(img, ...flagRect(bb, center, k)); }
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
  for (let ci = 0; ci < NI; ci++) {
    const b = RBB[ci]; if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    if (!G || !multi.has(ci)) { // región de un solo dueño: bandera recortada por el contorno
      const k = G ? PLAYABLE[owner[cellsOf[ci][0]]] : PLAYABLE[ci]; if (!k) continue;
      for (const p of RP[ci]) { if ((p.bb[2] - p.bb[0]) * cam.s < .6 && (p.bb[3] - p.bb[1]) * cam.s < .6) continue;
        c.save(); c.clip(p.path); drawFlagIn(c, k, k === PLAYABLE[ci] ? p.bb : b, k === PLAYABLE[ci] ? p.c : bbCenter(b)); c.restore(); }
      continue;
    }
    // región disputada: cada dueño pinta sus puntos con su bandera (frontera que se mueve)
    const [sx0, sy0] = toScreen(b[0], b[1]), [sx1, sy1] = toScreen(b[2], b[3]);
    const rx = Math.max(0, Math.floor(sx0)), ry = Math.max(0, Math.floor(sy0)), rw = Math.min(vw, Math.ceil(sx1)) - rx, rh = Math.min(vh, Math.ceil(sy1)) - ry;
    if (rw <= 0 || rh <= 0) continue;
    const owners = new Set(); for (const i of cellsOf[ci]) owners.add(owner[i]);
    c.save(); c.clip(RPATH[ci]); c.setTransform(1, 0, 0, 1, 0, 0);
    for (const o of owners) {
      if (o === 255) continue; const k = PLAYABLE[o], m = maskOf(ci, o);
      tmpCv.width = Math.ceil(rw * dpr); tmpCv.height = Math.ceil(rh * dpr);
      tctx.setTransform(dpr, 0, 0, dpr, -rx * dpr, -ry * dpr); tctx.imageSmoothingEnabled = true;
      const [mx0, my0] = toScreen(m.wb[0], m.wb[1]), [mx1, my1] = toScreen(m.wb[2], m.wb[3]);
      tctx.drawImage(m.cv, mx0, my0, mx1 - mx0, my1 - my0);
      tctx.globalCompositeOperation = 'source-in';
      const fb = k === PLAYABLE[ci] ? b : m.ob, [fx0, fy0] = toScreen(fb[0], fb[1]), [fx1, fy1] = toScreen(fb[2], fb[3]);
      const img = (fx1 - fx0) > 260 ? midFlag(k) : flagLo[k]; if (img) tctx.drawImage(img, ...flagRect([fx0, fy0, fx1, fy1], [(fx0 + fx1) / 2, (fy0 + fy1) / 2], k));
      tctx.globalCompositeOperation = 'source-over';
      c.drawImage(tmpCv, rx * dpr, ry * dpr);
    }
    c.restore();
  }
  setT(c);
  c.strokeStyle = 'rgba(8,12,20,.55)'; c.lineWidth = .8 / cam.s; for (let ci = 0; ci < NI; ci++) c.stroke(RPATH[ci]);
  if (G && G.n[G.me]) { // mi territorio: borde dorado (puntos de frontera)
    c.fillStyle = 'rgba(255,200,58,.55)';
    const F = FRONT && FRONT[IDX[G.me]]; if (F && F.length < 6000) for (const i of F) { if (owner[i - 1] !== owner[i] && owner[i - 1] !== 255 || owner[i + 1] !== owner[i] && owner[i + 1] !== 255 || owner[i - NX] !== owner[i] && owner[i - NX] !== 255 || owner[i + NX] !== owner[i] && owner[i + NX] !== 255) c.fillRect(cxOf(i) - CS / 2, cyOf(i) - CS / 2, CS, CS * .25); }
  }
  if (sel && G && G.n[sel]) { c.strokeStyle = '#fff'; c.lineWidth = 2.4 / cam.s; for (let ci = 0; ci < NI; ci++) if (owner[cellsOf[ci][0]] === IDX[sel] || multi.has(ci) && Array.from(cellsOf[ci]).some(i => owner[i] === IDX[sel])) c.stroke(RPATH[ci]); }
  if (!G && pickSel) { c.strokeStyle = '#fff'; c.lineWidth = 2.4 / cam.s; c.stroke(RPATH[IDX[pickSel]]); }
}
let tokens = [];
function render(now) {
  if (dirty) { dirty = false; renderBase(); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(baseCv, 0, 0);
  tokens = [];
  if (!G) return;
  const f = dayFrac(), me = G.me, zoomed = cam.s > minS() * 3;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // explosiones nucleares
  for (const b of (G.flashes || [])) { const k = (G.day + f - b.d) / 6; if (k > 1) continue; const [x, y] = toScreen(b.x, b.y); ctx.fillStyle = `rgba(255,${200 - 150 * k},80,${.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(x, y, 10 + k * (b.r || 6 * CS) * 1.3 * cam.s, 0, 7); ctx.fill(); }
  for (const s of G.sq) {
    if (!G.n[s.o]) continue;
    const mine = s.o === me, enemy = G.n[me] && atWar(s.o, me);
    if (!mine && !enemy && !(zoomed && enemiesOf(s.o).length) && !(zoomed && cam.s > minS() * 8)) continue;
    const x0 = s.px + (s.x - s.px) * f, y0 = s.py + (s.y - s.py) * f; let [x, y] = toScreen(x0, y0);
    for (let t = 0; t < 6 && tokens.some(o => Math.hypot(o.x - x, o.y - y) < 26); t++) { x += 22 * Math.cos(t * 2.1); y += 22 * Math.sin(t * 2.1); } // no encimar fichas
    if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40) continue;
    const r = clamp(7 + Math.log10(s.n + 1) * 2.6, 10, 22), on = selected.has(s.id);
    if (mine && s.tx != null) { const [tx, ty] = toScreen(s.tx, s.ty); ctx.strokeStyle = on ? '#ffc83a' : 'rgba(255,200,58,.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -now / 40; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 7); ctx.fillStyle = '#ffc83a'; ctx.fill(); }
    if (s.eng) { const p = (now / 300 + s.id * .37) % 1; ctx.strokeStyle = `rgba(255,210,90,${1 - p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4 + p * 14, 0, 7); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); if (flagLo[s.o]) ctx.drawImage(flagLo[s.o], ...flagRect([x - r, y - r, x + r, y + r], [x, y], s.o)); ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.lineWidth = on ? 3.5 : 2.2; ctx.strokeStyle = on ? '#fff' : mine ? '#ffc83a' : enemy ? '#ff3d3d' : 'rgba(10,14,22,.9)'; ctx.stroke();
    const label = fmtK(s.n); ctx.font = '800 11px Inter, sans-serif'; const tw = ctx.measureText(label).width;
    ctx.fillStyle = mine ? (on ? '#ffc83a' : 'rgba(15,22,32,.92)') : enemy ? '#8a1a1a' : 'rgba(15,22,32,.85)';
    ctx.beginPath(); ctx.roundRect(x - tw / 2 - 5, y + r - 3, tw + 10, 15, 7); ctx.fill();
    ctx.fillStyle = mine && on ? '#111' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + r + 4.5);
    tokens.push({ s, x, y, r: r + 6 });
  }
  if (box) { ctx.strokeStyle = '#ffc83a'; ctx.fillStyle = 'rgba(255,200,58,.12)'; ctx.lineWidth = 1.5; const [a, b2, c2, d2] = box; ctx.fillRect(a, b2, c2 - a, d2 - b2); ctx.strokeRect(a, b2, c2 - a, d2 - b2); }
  ctx.restore();
}
function hitRegion(sx, sy) { // índice de celda bajo el dedo (o la más cercana de tierra)
  const wx = cam.x + (sx - vw / 2) / cam.s, wy = cam.y + (sy - vh / 2) / cam.s; let i = cellAt(wx, wy);
  if (i >= 0 && owner[i] !== 255) return i;
  let best = -1, bd = (10 / cam.s) ** 2; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const j = cellAt(wx + dx * CS, wy + dy * CS); if (j >= 0 && owner[j] !== 255) { const d = (cxOf(j) - wx) ** 2 + (cyOf(j) - wy) ** 2; if (d < bd) { bd = d; best = j; } } }
  return best;
}

/* ======================= INTERFAZ ======================= */
let speed = 0, acc = 0, modalOpen = false, sheetFor = null, tab = 'res', dipFilter = 'all';
const selected = new Set(); let box = null;
const dayFrac = () => (speed && !modalOpen ? clamp(acc / (700 / speed), 0, 1) : 0);
function setSpeed(s) { speed = s; document.querySelectorAll('.speeds button').forEach(b => b.classList.toggle('on', +b.dataset.sp === s)); }
document.querySelectorAll('.speeds button').forEach(b => (b.onclick = () => setSpeed(+b.dataset.sp)));
function pushNews(msg, cls = '') {
  const box2 = $('news'), d = document.createElement('div'); d.className = cls; d.textContent = msg; box2.prepend(d);
  while (box2.children.length > 3) box2.lastChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, 5500);
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2800); }
function hud() {
  const me = G.me, n = G.n[me];
  document.body.style.setProperty('--barh', document.querySelector('.bar').offsetHeight + 'px');
  $('sDate').textContent = dateOf(G.day);
  $('sTension').textContent = Math.round(G.tension) + ' %';
  if (!n) return;
  $('sTreasury').textContent = money(n.treasury); $('sFund').textContent = fmtK(n.soldiers);
  $('sGdp').textContent = money(gdpOf(me)); $('sPower').textContent = (gdpOf(me) / worldGdp() * 100).toFixed(1).replace('.', ',') + ' %';
  $('wars').innerHTML = warsOf(me).map(w => { const e = w.a === me ? w.b : w.a, r = power(me) / Math.max(1, power(e)), pct = Math.round(100 * r / (1 + r));
    return `<button class="war" data-k="${e}"><img src="${flagSrc(me)}" alt=""><span class="vs">VS</span><img src="${flagSrc(e)}" alt=""><span>${name(e)}</span>
      <span class="bar2" title="Fuerza total comparada"><i style="width:${pct}%"></i></span></button>`; }).join('') +
    (G.wars.length ? `<div class="war world">🌍 ${G.wars.length} guerra${G.wars.length > 1 ? 's' : ''} en el mundo</div>` : '');
  $('wars').querySelectorAll('[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
  renderArmyBar(); updateNukeBtn();
}
const relLabel = r => (r >= 80 ? 'Excelente' : r >= 60 ? 'Buena' : r >= 40 ? 'Neutral' : r >= 20 ? 'Mala' : 'Hostil');
const relColor = r => (r >= 60 ? 'var(--green)' : r >= 40 ? 'var(--yellow)' : r >= 20 ? 'var(--orange)' : 'var(--red)');
const bar = (v, color) => `<div class="relbar"><i style="width:${clamp(v, 0, 100)}%;background:${color || relColor(v)}"></i></div>`;
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; }
function closeSheet() { $('sheet').hidden = true; sheetFor = null; sel = null; dirty = true; document.querySelectorAll('.dock button').forEach(b => b.classList.remove('on')); }
$('sheetClose').onclick = closeSheet;
const selSquads = () => G.sq.filter(s => selected.has(s.id) && s.o === G.me);
function renderArmyBar() {
  const el = $('armyBar'); if (!G || !G.n[G.me]) { el.hidden = true; return; }
  const ss = selSquads(); for (const id of [...selected]) if (!ss.some(s => s.id === id)) selected.delete(id);
  if (!ss.length) { el.hidden = true; el.dataset.sig = ''; return; }
  const tot = ss.reduce((a, s) => a + s.n, 0), auto = ss.every(s => s.auto), sig = [ss.map(s => s.id).join(), fmtK(tot), auto, ss.some(s => s.tx != null)].join();
  if (el.dataset.sig === sig && !el.hidden) return; el.dataset.sig = sig; el.hidden = false;
  el.innerHTML = `<div class="top"><b>${ss.length === 1 ? 'ESCUADRÓN' : ss.length + ' ESCUADRONES'}</b><small>${fmtInt(tot)} soldados · fuerza ${fmtK(tot * quality(G.me))}</small></div>
    <div class="tip">👉 Tocá el mapa para mandarlos. En territorio enemigo, anexan todo lo que pisan sin oposición.</div>
    <div class="acts"><button class="btn ${auto ? 'good' : 'warbtn'}" data-x="auto">${auto ? '⚔️ AVANCE AUTOMÁTICO: SÍ' : '⚔️ AVANCE AUTOMÁTICO'}</button>
      <button class="btn blue" data-x="split">DIVIDIR</button>${ss.length > 1 ? '<button class="btn blue" data-x="merge">UNIR</button>' : ''}
      <button class="btn" data-x="all">TODOS</button><button class="btn" data-x="stop">FRENAR</button><button class="btn" data-x="close">✕</button></div>`;
  el.querySelectorAll('[data-x]').forEach(b => (b.onclick = () => {
    const x = b.dataset.x, list = selSquads();
    if (x === 'auto') { const v = !list.every(s => s.auto); list.forEach(s => { s.auto = v; if (v) autoTarget(s); }); if (v && !enemiesOf(G.me).length) toast('No estás en guerra con nadie: declará una guerra primero'); }
    if (x === 'split') list.forEach(s => { if (s.n < 2000) return; s.n /= 2; const t = { ...s, id: ++G.sqSeq, x: s.x + 2, y: s.y + 2, px: s.x + 2, py: s.y + 2 }; G.sq.push(t); selected.add(t.id); });
    if (x === 'merge') { const [a, ...rest] = list; rest.forEach(s => { a.n += s.n; G.sq.splice(G.sq.indexOf(s), 1); selected.delete(s.id); }); }
    if (x === 'all') sqOf(G.me).forEach(s => selected.add(s.id));
    if (x === 'stop') list.forEach(s => { s.tx = s.ty = null; s.auto = false; });
    if (x === 'close') selected.clear();
    el.dataset.sig = ''; renderArmyBar();
  }));
}
function orderTo(i) { // mandar los seleccionados al punto i
  const me = G.me, o = owner[i], k = PLAYABLE[o], ss = selSquads(); if (!ss.length) return;
  if (k && k !== me && !atWar(me, k)) return toast(`${name(k)} no está en guerra con vos: declarale la guerra primero (tocá el país sin escuadrones seleccionados)`);
  const tx = cxOf(i), ty = cyOf(i);
  if (!shipsOK(me) && ss.some(s => crossesSea(s.x, s.y, tx, ty))) return toast('Para cruzar el mar necesitás al menos 3 buques de guerra');
  ss.forEach((s, j) => { s.tx = tx + (j % 3 - 1) * 3; s.ty = ty + (Math.floor(j / 3) - 1) * 3; s.auto = false; });
  toast(k && k !== me ? `⚔️ Atacando ${name(k)}` : 'En marcha');
}
function openCountry(k) { if (k === G.me) return openMe('res'); sel = k; sheetFor = k; dirty = true; document.querySelectorAll('.dock button').forEach(b => b.classList.remove('on')); renderCountry(); }
function renderCountry() {
  const o = sheetFor, me = G.me, n = G.n[o]; if (!n) return closeSheet();
  const r = rel(me, o), war = atWar(me, o), al = allied(me, o), myN = G.n[me];
  const cost = Math.max(.05, gdpOf(me) * .0005), cooldown = myN && myN.relDay[o] && G.day - myN.relDay[o] < 30;
  const allyWars = al ? enemiesOf(o).filter(e => e !== me && !atWar(me, e)) : [];
  const ratio = myN ? power(me) / Math.max(1, power(o, true)) : 0, nukeOK = myN && war && myN.nukes > 0;
  openSheet(`<div class="sh-head"><img src="${flagSrc(o)}" alt=""><div><h2>${up(name(o))}</h2>
      <p>${ideoOf(o).n}${al ? ' <span class="chip2">ALIADO</span>' : ''}${war ? ' <span class="chip2 war">EN GUERRA</span>' : ''}</p></div></div>
    <div class="sec"><h3>🤝 RELACIÓN CON ${up(name(me))}</h3><div class="slider"><span style="color:#fff">${relLabel(r)}</span><span>${r} / 100</span>${bar(r)}</div></div>
    ${myN ? `<div class="sec"><h3>⚔️ COMPARACIÓN MILITAR</h3><div class="slider"><span style="color:#fff">${ratio >= 1.5 ? 'Sos mucho más fuerte' : ratio >= 1 ? 'Sos un poco más fuerte' : ratio >= .66 ? 'Es un poco más fuerte' : 'Es mucho más fuerte'}</span><span>${ratio.toFixed(1)}×</span>${bar(100 * ratio / (1 + ratio), ratio >= 1 ? 'var(--green)' : 'var(--red)')}</div></div>` : ''}
    <div class="grid2">
      <div class="cell"><small>📈 PBI</small><b>${money(gdpOf(o))}</b></div><div class="cell"><small>👥 POBLACIÓN</small><b>${fmtInt(popOf(o) / 1e6)} M</b></div>
      <div class="cell"><small>🪖 SOLDADOS</small><b>${fmtK(n.soldiers)}</b></div><div class="cell"><small>⭐ CALIDAD</small><b>×${quality(o).toFixed(1)}</b></div>
      <div class="cell"><small>✈️ AVIONES</small><b>${fmtInt(n.eq.air)}</b></div><div class="cell"><small>⚓ BUQUES</small><b>${fmtInt(n.eq.ship)}</b></div>
    </div>
    ${enemiesOf(o).length ? `<div class="hint">En guerra con: ${enemiesOf(o).map(name).join(', ')}</div>` : ''}
    ${myN ? `<div class="acts">
      ${war ? `<button class="btn warbtn" data-a="attack">⚔️ ATACAR CON TODO</button><button class="btn good" data-a="peace">🕊️ PROPONER PAZ</button>` : `<button class="btn warbtn" data-a="war">⚔️ DECLARAR GUERRA</button>`}
      ${!war ? `<button class="btn good" data-a="rel" ${cooldown ? 'disabled' : ''}>🤝 MEJORAR RELACIÓN (${money(cost)})</button>` : ''}
      ${!war && !al ? `<button class="btn blue" data-a="ally" ${r < 70 ? 'disabled' : ''}>📜 PROPONER ALIANZA${r < 70 ? ' (70+)' : ''}</button>` : ''}
      ${al ? `<button class="btn" data-a="unally">ROMPER ALIANZA</button>` : ''}
      ${allyWars.length ? `<button class="btn warbtn" data-a="help">🛡️ DEFENDERLO (${allyWars.map(name).join(', ')})</button>` : ''}
      ${nukeOK ? `<button class="btn warbtn" data-a="nuke">☢️ BOMBA SOBRE SU CAPITAL (te quedan ${myN.nukes})</button>` : ''}
    </div>${!war && !canReach(me, o) ? '<div class="hint">No tenés frontera con este país: para invadirlo por mar necesitás buques de guerra.</div>' : ''}` : ''}`);
  $('sheetBody').querySelectorAll('[data-a]').forEach(b => (b.onclick = () => countryAction(b.dataset.a, o, cost)));
}
function countryAction(a, o, cost) {
  const me = G.me, n = G.n[me];
  if (a === 'rel') { if (n.treasury < cost) return toast('No alcanza el tesoro'); n.treasury -= cost; addRel(me, o, 6); n.relDay[o] = G.day; toast(`Relación con ${name(o)} +6`); }
  if (a === 'ally') { if (rel(me, o) >= 70 && Math.random() < (rel(me, o) - 50) / 40) { G.ally[pk(me, o)] = 1; news(`📜 ${name(o)} aceptó la alianza`, 'good', true); } else { addRel(me, o, -3); toast(`${name(o)} rechazó la alianza`); } }
  if (a === 'unally') { delete G.ally[pk(me, o)]; addRel(me, o, -20); toast('Alianza rota'); }
  if (a === 'help') { enemiesOf(o).forEach(e => { if (e !== me && !atWar(me, e)) declareWar(me, e, 2); }); addRel(me, o, 15); }
  if (a === 'war') return confirmBox(`¿Declarar la guerra a ${name(o)}?`, `Sus aliados (${alliesOf(o).filter(x => rel(x, o) >= 50).map(name).join(', ') || 'ninguno'}) pueden entrar a defenderlo y la tensión mundial sube. Después seleccioná tus escuadrones y tocá ${name(o)} en el mapa, o usá ATACAR CON TODO.`, 'DECLARAR GUERRA', () => { declareWar(me, o); renderCountry(); hud(); });
  if (a === 'attack') { // todos los escuadrones en avance automático contra este país
    const F = FRONT[IDX[o]]; let ok = 0;
    for (const s of sqOf(me)) { const c = nearestCell(F.length ? F : cellsOf[IDX[o]], s.x, s.y); if (!shipsOK(me) && crossesSea(s.x, s.y, cxOf(c), cyOf(c))) continue; s.tx = cxOf(c); s.ty = cyOf(c); s.auto = true; ok++; }
    toast(ok ? `⚔️ ${ok} escuadrón${ok > 1 ? 'es' : ''} avanzando sobre ${name(o)}` : 'Ningún escuadrón puede llegar: necesitás buques para cruzar el mar'); closeSheet(); return;
  }
  if (a === 'peace') { const ratio = power(me) / Math.max(1, power(o, true)); const w = G.wars.find(w => (w.a === me && w.b === o) || (w.b === me && w.a === o));
    if (ratio > 1.3 || (G.day - w.day > 365 && Math.random() < .4) || Math.random() < .1) makePeace(me, o); else toast(`${name(o)} rechazó la paz`); }
  if (a === 'nuke') return confirmBox('☢️ ¿Tirar la bomba sobre la capital?', `Arrasa la capital de ${name(o)} y aniquila las tropas cercanas. Todos los países te van a odiar y se puede formar una coalición en tu contra.`, 'TIRARLA', () => {
    n.nukes--; const cap = G.n[o].cap; detonate(me, cxOf(cap), cyOf(cap)); updateNukeBtn(); renderCountry(); hud(); });
  renderCountry(); hud(); dirty = true;
}
const nukeCost = k => Math.max(3, gdpOf(k) * .004);
function nukeSection(me) {
  const n = G.n[me]; if (!has(me, 'nuk')) return `<div class="sec"><h3>☢️ ARSENAL NUCLEAR</h3><div class="hint">Investigá BOMBA NUCLEAR en 🔬 INVESTIGAR para fabricarlas.</div></div>`;
  return `<div class="sec"><h3>☢️ ARSENAL NUCLEAR · ${n.nukes} bomba${n.nukes === 1 ? '' : 's'} lista${n.nukes === 1 ? '' : 's'}</h3>
    <div class="hint">Cada bomba arrasa un radio enorme: mata 85 % de las tropas enemigas, destruye ciudades y economía. El mundo te va a odiar.</div>
    <div class="acts">${n.nukeBuild ? `<button class="btn" disabled>FABRICANDO · LISTA EL ${dateOf(n.nukeBuild)}</button>` : `<button class="btn warbtn" data-nukebuild>☢️ FABRICAR 1 BOMBA (${money(nukeCost(me))} · 120 días)</button>`}
    ${n.nukes ? `<button class="btn warbtn" data-nukearm>🎯 TIRAR UNA AHORA</button>` : ''}</div></div>`;
}
let nukeMode = false;
function armNuke() { if (!G.n[G.me].nukes) return toast('No tenés bombas listas'); nukeMode = true; selected.clear(); closeSheet(); renderArmyBar(); toast('☢️ Tocá en el mapa el territorio enemigo donde tirarla'); updateNukeBtn(); }
function updateNukeBtn() { const b = $('btnNuke'); if (!b || !G || !G.n[G.me]) return; const k = G.n[G.me].nukes; b.hidden = !k; b.textContent = nukeMode ? '✕ CANCELAR' : `☢️ ${k}`; b.classList.toggle('on', nukeMode); }
// explosión nuclear: radio grande, aniquila tropas, ciudades y economía
function detonate(by, x, y) {
  const R = 10 * CS, hit = new Set();
  for (const i of LAND) { const d = Math.hypot(cxOf(i) - x, cyOf(i) - y); if (d < R) { const f = 1 - d / R * .5; dmg[i] = 1; cellPop[i] *= 1 - .8 * f; cellGdp[i] *= 1 - .7 * f; if (owner[i] !== 255) hit.add(PLAYABLE[owner[i]]); } }
  for (const s of G.sq) if (s.o !== by && Math.hypot(s.x - x, s.y - y) < R * 1.2) s.n *= .15;
  G.sq = G.sq.filter(s => s.n >= 1);
  hit.delete(by); for (const k of hit) if (G.n[k]) G.n[k].stab = Math.max(0, G.n[k].stab - 35);
  alive().forEach(o => o !== by && addRel(o, by, -20)); G.tension = clamp(G.tension + 15, 0, 100);
  if (by === G.me) G.ae += 2; else G.aeN[by] = (G.aeN[by] || 0) + 2; // el mundo se une contra quien usa armas nucleares
  (G.flashes = G.flashes || []).push({ x, y, d: G.day, r: R }); syncSoldiers(); recomputeAgg(); dirty = true;
  news(`☢️ ${name(by)} lanzó una bomba nuclear sobre ${[...hit].map(name).join(', ') || 'el mar'}`, '', true);
}
const unitIcon = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
function advice(me) {
  const n = G.n[me], out = [];
  for (const e of enemiesOf(me)) {
    if (!sqOf(me).some(s => s.tx != null || s.auto)) out.push(['warn', `⚔️ Estás en guerra con ${name(e)} y tus tropas están quietas. Tocá un escuadrón (círculo con tu bandera) y después tocá ${name(e)}.`]);
    if (G.sq.some(s => s.o === e && owner[cellAt(s.x, s.y)] === IDX[me])) out.push(['warn', `🛡️ Hay tropas de ${name(e)} dentro de tu país: mandá un escuadrón a frenarlas.`]);
  }
  if (n.bud.mil < 1.5) out.push(['', `🪖 Tu gasto militar es ${n.bud.mil.toFixed(1)} % del PBI: casi no se producen soldados nuevos. Subilo en 💰 PRESUPUESTO si vas a pelear.`]);
  if (n.bud.res < .5) out.push(['', '🔬 Casi no investigás: subí INVESTIGACIÓN en PRESUPUESTO para desbloquear mejoras.']);
  if (n.rp >= (TECH.find(t => !n.techs[t.k] && (!t.req || n.techs[t.req])) || { cost: 1e9 }).cost) out.push(['', '🔬 Te alcanzan los puntos para una tecnología nueva: abrí INVESTIGACIÓN.']);
  if (n.stab < 40) out.push(['warn', '😠 La estabilidad está baja: subí el gasto social o terminá guerras.']);
  const tot = n.bud.soc + n.bud.res + n.bud.mil + n.bud.liq; if (tot > 22) out.push(['', `📉 Gastás ${tot.toFixed(0)} % del PBI: por encima del 22 % la economía crece menos.`]);
  if (G.ae > .8) out.push(['warn', '⚠️ Te estás expandiendo rápido: si seguís así se puede formar una coalición en tu contra.']);
  if (!out.length) out.push(['', '✅ Todo en orden. Pensá a quién conquistar o con quién aliarte.']);
  return out.slice(0, 4).map(([c, t]) => `<div class="${c}">${t}</div>`).join('');
}
function openMe(t = 'res') {
  tab = t; sheetFor = G.me; sel = null; dirty = true;
  document.querySelectorAll('.dock button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const me = G.me, n = G.n[me]; if (!n) return;
  const tabs = [['res', '🏛️ PAÍS'], ['army', '⚔️ EJÉRCITO'], ['bud', '💰 PRESUPUESTO'], ['tech', '🔬 INVESTIGAR'], ['dip', '🤝 DIPLOMACIA'], ['ideo', '📜 GOBIERNO']];
  let body = '';
  if (t === 'res') {
    const share = gdpOf(me) / worldGdp() * 100, regs = myRegions().map(ci => { const cs = Array.from(cellsOf[ci]); const mine = cs.filter(i => owner[i] === IDX[me]); return { ci, pct: mine.length / cs.length, dmg: mine.reduce((s, i) => s + dmg[i], 0) / Math.max(1, mine.length) }; });
    body = `<div class="sec"><h3>🏆 OBJETIVO: 50 % DEL PBI MUNDIAL</h3><div class="slider"><span style="color:#fff">Controlás ${share.toFixed(1).replace('.', ',')} % del PBI mundial</span><span>${share.toFixed(1)} / 50</span>${bar(share * 2, 'var(--yellow)')}</div></div>
    <div class="gauges">
      <div class="gauge"><span class="ic">📈</span><small>PBI</small><b>${money(gdpOf(me))}</b>${bar(100 * Math.log10(gdpOf(me) * 1000 + 1) / 7.5, 'var(--blue)')}</div>
      <div class="gauge"><span class="ic">🪖</span><small>SOLDADOS</small><b>${fmtK(n.soldiers)}</b>${bar(100 * Math.log10(n.soldiers + 1) / 6.5, 'var(--red)')}</div>
      <div class="gauge"><span class="ic">🙂</span><small>ESTABILIDAD</small><b>${Math.round(n.stab)} %</b>${bar(n.stab)}</div>
      <div class="gauge"><span class="ic">🏠</span><small>CALIDAD DE VIDA</small><b>${Math.round(avgQol(me))} / 100</b>${bar(avgQol(me))}</div>
    </div>
    <div class="grid2"><div class="cell"><small>💰 TESORO</small><b>${money(n.treasury)}</b></div><div class="cell"><small>👥 POBLACIÓN</small><b>${fmtInt(popOf(me) / 1e6)} M</b></div></div>
    <div class="sec"><h3>💡 CONSEJOS</h3><div class="advice">${advice(me)}</div></div>
    <div class="sec"><h3>🏙️ TUS REGIONES</h3><div class="list">${regs.sort((a, b) => b.pct - a.pct).map(r => { const k = PLAYABLE[r.ci], c = Q[k].gdp * r.pct * r.dmg * .05;
      return `<div class="terr"><img src="${flagSrc(k)}" alt=""><div><div>${name(k)} <span class="chip2">${Math.round(r.pct * 100)} %</span>${r.dmg > .3 ? ' <span class="chip2 war">DESTRUIDA</span>' : ''}</div>
        <div class="mini"><span>🏗️ ${Math.round(G.reg[r.ci].infra)}</span>${bar(G.reg[r.ci].infra)}<span>💥 ${Math.round(r.dmg * 100)} %</span>${bar(r.dmg * 100, 'var(--red)')}</div></div>
        ${r.dmg > .05 ? `<button data-r="${r.ci}">REPARAR ${money(c)}</button>` : '<span></span>'}</div>`; }).join('')}</div></div>`;
  }
  if (t === 'bud') {
    const b = n.bud, gdp = gdpOf(me), tot = b.soc + b.res + b.mil + b.liq;
    const sl = (k, label, max, hint) => `<label class="slider" for="b_${k}">${label}<span data-v="${k}">${b[k].toFixed(1)} % · ${money(gdp * b[k] / 100)}/año</span>
      <input id="b_${k}" type="range" min="0" max="${max}" step="0.1" value="${b[k]}" data-k="${k}"><span class="hint">${hint}</span></label>`;
    body = `<div class="hint">Cada barra es un porcentaje de tu PBI (${money(gdp)}). <b style="color:#fff">Si el total pasa el 22 %, la economía crece menos.</b></div>
      <div class="budbar" id="budbar"></div><div class="slider">Gasto total<span data-v="tot">${tot.toFixed(1)} % del PBI</span></div>
      ${sl('soc', '🏠 Gasto social', 30, 'Salud, educación y vivienda: calidad de vida, estabilidad y población.')}
      ${sl('res', '🔬 Investigación', 8, `Genera puntos para desbloquear tecnologías (hoy ${(Math.sqrt(gdp * b.res / 100) * .3 * 30).toFixed(0)} puntos por mes).`)}
      ${sl('mil', '⚔️ Militar', 30, 'Produce soldados nuevos solos (hasta 0,8 % de la población en paz, 1,5 % en guerra) y mejora su efectividad.')}
      ${sl('liq', '💰 Liquidez (ahorro)', 10, 'Plata que entra al tesoro: con ella comprás armamento, reclutás al instante y hacés diplomacia.')}`;
  }
  if (t === 'tech') {
    body = `<div class="hint">Tenés <b style="color:#fff">${fmtInt(n.rp)} puntos</b>. Ganás más subiendo 🔬 Investigación en PRESUPUESTO.</div>
      <div class="list">${TECH.map(tc => { const done = n.techs[tc.k], lock = tc.req && !n.techs[tc.req], can = !done && !lock && n.rp >= tc.cost;
        return `<button class="choice" data-tech="${tc.k}" ${done || !can ? 'disabled' : ''} style="${done ? 'border-color:var(--green)' : ''}"><b>${tc.ic} ${tc.n} ${done ? '✓' : ''}</b>${tc.d} · ${done ? 'INVESTIGADO' : lock ? `necesita ${TECH.find(x => x.k === tc.req).n}` : `${fmtInt(tc.cost)} puntos`}</button>`; }).join('')}</div>`;
  }
  if (t === 'ideo') {
    const cd = G.day - n.ideoDay < 365;
    body = `<div class="hint">Elegí cómo se gobierna tu país. Cambiar baja la estabilidad 25 puntos y no se puede repetir por un año.${cd ? ` <b style="color:#fff">Disponible el ${dateOf(n.ideoDay + 365)}.</b>` : ''}</div>
      <div class="ideos">${Object.entries(IDEO).map(([k, I]) => `<button class="ideo ${n.ideo === k ? 'on' : ''}" data-i="${k}" ${cd && n.ideo !== k ? 'disabled' : ''}>
        <b>${I.n}${n.ideo === k ? ' · ACTUAL' : ''}</b><ul>${I.d.map(([c, x]) => `<li class="${c}">${x}</li>`).join('')}</ul></button>`).join('')}</div>`;
  }
  if (t === 'army') {
    const q = G.q.filter(o => o.k === me).sort((a, b) => a.day - b.day), cap = manpower(me) * (warsOf(me).length ? .015 : .008), rc = recruitCost(me, 10000);
    body = `<div class="sec"><h3>🗺️ ESCUADRONES (${sqOf(me).length})</h3><div class="list">${sqOf(me).sort((a, b) => b.n - a.n).map(s => { const o = owner[cellAt(s.x, s.y)];
        return `<button class="rel" data-sq="${s.id}"><span>${s.eng ? '💥' : s.auto ? '⚔️' : s.tx != null ? '🚶' : '🛡️'}</span><span>${fmtInt(s.n)} soldados</span><span class="hint">${s.eng ? 'combatiendo' : s.auto ? 'avance automático' : s.tx != null ? 'en marcha' : 'quieto'} · ${o !== 255 ? name(PLAYABLE[o]) : 'en el mar'}</span><span>›</span></button>`; }).join('')}</div>
      <div class="hint">Cada escuadrón es un círculo con tu bandera. Tocalo (o arrastrá un recuadro en computadora) y después tocá el mapa.</div></div>
      <div class="prod"><div class="row"><span>🪖 Soldados</span><b>${fmtInt(n.soldiers)} / ${fmtInt(cap)}</b></div><div class="row"><span>⭐ Calidad por soldado</span><b>×${quality(me).toFixed(2)}</b></div>
        <div class="row"><span>🏭 Producción pasiva</span><b>${n.bud.mil < 1 ? 'casi nula' : 'activa (sube MILITAR)'}</b></div></div>
      <button class="btn warbtn" data-recruit ${n.soldiers + 10000 > cap || n.treasury < rc ? 'disabled' : ''}>🪖 RECLUTAR 10.000 YA (${money(rc)} del tesoro)</button>
      <div class="sec"><h3>🛒 EQUIPAMIENTO (con el tesoro · mejora la calidad)</h3><div class="ucards">${UK.map(k => {
        const U = UNITS[k], b1 = buy(me, k, 1, true), b10 = buy(me, k, 10, true);
        return `<div class="uc">${unitIcon(k)}<b>${fmtInt(n.eq[k])}</b><small>${U.n}<br>${U.desc}</small>
          <div class="price">${U.lot > 1 ? `Lote de ${fmtInt(U.lot)}: ` : ''}${money(unitCost(k))}${b1.ok ? ` · llega ${dateOf(b1.arr)}` : ` · <span style="color:var(--red)">${b1.msg}</span>`}</div>
          <div class="buy"><button data-b="${k}" data-l="1">COMPRAR ×1</button><button data-b="${k}" data-l="10">×10</button>${has(me, 'ind') ? `<button data-b="${k}" data-l="100">×100</button>` : ''}</div></div>`; }).join('')}</div>
      ${has(me, 'ind') ? '' : '<div class="hint">🏭 Investigá INDUSTRIA para comprar de a ×100.</div>'}</div>
      ${nukeSection(me)}
      ${q.length ? `<div class="sec"><h3>📦 EN CAMINO</h3><div class="units">${q.slice(0, 10).map(o => `<div><span>${UNITS[o.t].n}</span><b>${fmtInt(o.n)} · ${dateOf(o.day)}</b></div>`).join('')}</div></div>` : ''}`;
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
  const keep = !$('sheet').hidden && $('sheetBody').dataset.tab === t ? $('sheet').scrollTop : 0;
  openSheet(`<div class="sh-head"><img src="${flagSrc(me)}" alt=""><div><h2>${up(name(me))}</h2><p>${ideoOf(me).n} · ${(gdpOf(me) / worldGdp() * 100).toFixed(1).replace('.', ',')} % del PBI mundial</p></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${t === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="sec">${body}</div>`);
  $('sheetBody').dataset.tab = t; $('sheet').scrollTop = keep;
  const sb = $('sheetBody');
  sb.querySelectorAll('[data-t]').forEach(b => (b.onclick = () => openMe(b.dataset.t)));
  sb.querySelectorAll('button[data-k]').forEach(b => (b.onclick = () => openCountry(b.dataset.k)));
  sb.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { dipFilter = b.dataset.f; openMe('dip'); }));
  sb.querySelectorAll('[data-sq]').forEach(b => (b.onclick = () => { const s = G.sq.find(x => x.id === +b.dataset.sq); if (!s) return; selected.clear(); selected.add(s.id); closeSheet(); renderArmyBar(); flyTo([s.x - 40, s.y - 30, s.x + 40, s.y + 30], 1); }));
  const budbar = () => { const el = sb.querySelector('#budbar'); if (!el) return; const b = n.bud;
    el.innerHTML = [[b.soc, '#1f8a52', 'SOCIAL'], [b.res, '#6a4bd6', 'CIENCIA'], [b.mil, '#c0392b', 'MILITAR'], [b.liq, '#8a6d1c', 'AHORRO']].map(([v, c, l]) => `<i style="flex-grow:${v};background:${c}">${v >= 4 ? l : ''}</i>`).join(''); };
  budbar();
  sb.querySelectorAll('input[data-k]').forEach(inp => (inp.oninput = () => {
    const k = inp.dataset.k; n.bud[k] = +inp.value; const gdp = gdpOf(me);
    sb.querySelector(`[data-v="${k}"]`).textContent = `${n.bud[k].toFixed(1)} % · ${money(gdp * n.bud[k] / 100)}/año`;
    const tot = n.bud.soc + n.bud.res + n.bud.mil + n.bud.liq; const el = sb.querySelector('[data-v="tot"]'); el.textContent = `${tot.toFixed(1)} % del PBI${tot > 22 ? ' (frena el crecimiento)' : ''}`; el.style.color = tot > 22 ? 'var(--red)' : '';
    budbar();
  }));
  sb.querySelectorAll('[data-tech]').forEach(b => (b.onclick = () => { const tc = TECH.find(x => x.k === b.dataset.tech); if (n.rp < tc.cost) return; n.rp -= tc.cost; n.techs[tc.k] = 1; news(`🔬 Investigaste: ${tc.n}`, 'good', true); openMe('tech'); }));
  sb.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => {
    const k = b.dataset.i; if (k === n.ideo) return;
    confirmBox(`¿Cambiar a ${IDEO[k].n}?`, 'La estabilidad baja 25 puntos y no podés volver a cambiar por un año.', 'CAMBIAR', () => {
      n.ideo = k; n.ideoDay = G.day; n.stab = Math.max(0, n.stab - 25); news(`📜 ${name(me)} adoptó: ${IDEO[k].n}`, 'info', true); openMe('ideo'); });
  }));
  sb.querySelectorAll('[data-b]').forEach(b => (b.onclick = () => { const r = buy(me, b.dataset.b, +b.dataset.l); if (r.ok) { toast(`Pedido: ${UNITS[b.dataset.b].n} ×${b.dataset.l} · llega el ${dateOf(r.arr)}`); openMe('army'); hud(); } else toast(r.msg); }));
  const nb = sb.querySelector('[data-nukebuild]'); if (nb) nb.onclick = () => { const c = nukeCost(me); if (n.treasury < c) return toast('No alcanza el tesoro'); n.treasury -= c; n.nukeBuild = G.day + 120; toast(`☢️ Bomba en fabricación: lista el ${dateOf(n.nukeBuild)}`); openMe('army'); hud(); };
  const nl = sb.querySelector('[data-nukearm]'); if (nl) nl.onclick = () => { armNuke(); };
  const rb = sb.querySelector('[data-recruit]'); if (rb) rb.onclick = () => { const c = recruitCost(me, 10000); if (n.treasury < c) return; n.treasury -= c; n.reserve += 10000; deploy(me); syncSoldiers(); toast('10.000 soldados nuevos en la capital'); openMe('army'); hud(); };
  sb.querySelectorAll('[data-r]').forEach(b => (b.onclick = () => {
    const ci = +b.dataset.r, mine = Array.from(cellsOf[ci]).filter(i => owner[i] === IDX[me]), d = mine.reduce((s, i) => s + dmg[i], 0) / Math.max(1, mine.length);
    const c = Q[PLAYABLE[ci]].gdp * (mine.length / cellsOf[ci].length) * d * .05; if (n.treasury < c) return toast('No alcanza el tesoro');
    n.treasury -= c; mine.forEach(i => (dmg[i] = 0)); G.reg[ci].infra = Math.min(100, G.reg[ci].infra + 5); recomputeAgg(); openMe('res'); hud();
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
function nextModal() { const m = modalQ.shift(); if (!m) { modalOpen = false; $('modal').hidden = true; return; } modalOpen = true; $('modal').hidden = false; $('modalBody').innerHTML = m[0]; m[1]($('modalBody'), () => nextModal()); }
function confirmBox(title, text, ok, fn) { modal(`<h2>${title}</h2><p>${text}</p><div class="acts"><button class="btn" data-x>CANCELAR</button><button class="btn primary" data-ok>${ok}</button></div>`, (el, close) => { el.querySelector('[data-x]').onclick = close; el.querySelector('[data-ok]').onclick = () => { close(); fn(); }; }); }
function askHelp(ally, aggressor) {
  modal(`<div class="event-tag">ALIADO EN PELIGRO</div><h2>🛡️ ${name(ally)} pide ayuda</h2><p><b>${name(aggressor)}</b> invadió a tu aliado <b>${name(ally)}</b>. ¿Entrás en la guerra para defenderlo?</p>
    <div class="acts"><button class="btn" data-no>NO INTERVENIR</button><button class="btn warbtn" data-yes>DEFENDERLO</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = () => { addRel(G.me, ally, -25); close(); };
    el.querySelector('[data-yes]').onclick = () => { declareWar(G.me, aggressor, 2); addRel(G.me, ally, 15); close(); hud(); };
  });
}
function askPeace(k) {
  modal(`<h2>🕊️ ${name(k)} propone la paz</h2><p>Cada uno se queda con el territorio que ocupa hoy.</p>
    <div class="acts"><button class="btn" data-no>SEGUIR LA GUERRA</button><button class="btn good" data-yes>ACEPTAR LA PAZ</button></div>`, (el, close) => {
    el.querySelector('[data-no]').onclick = close; el.querySelector('[data-yes]').onclick = () => { makePeace(G.me, k); close(); hud(); };
  });
}
function showDefeat(by) {
  try { localStorage.removeItem(SAVE); } catch {}
  modal(`<img src="${flagSrc(by)}" alt="" style="width:120px;border-radius:8px"><h2>${up(name(by))} TE CONQUISTÓ</h2><p>Cayó tu capital el ${dateOf(G.day)}.</p>
    <div class="acts"><button class="btn" data-w>SEGUIR MIRANDO</button><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, (el, close) => {
    el.querySelector('[data-w]').onclick = close; el.querySelector('[data-n]').onclick = () => { leaving = true; location.reload(); };
  });
}
function showWin50() {
  setSpeed(0);
  modal(`<img src="${flagSrc(G.me)}" alt="" style="width:140px;border-radius:8px"><h2>¡DOMINÁS EL MUNDO!</h2><p>Controlás más de la mitad del PBI mundial (${dateOf(G.day)}). Podés seguir hasta que no quede nadie.</p>
    <div class="acts"><button class="btn" data-c>SEGUIR JUGANDO</button><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, (el, close) => {
    el.querySelector('[data-c]').onclick = close; el.querySelector('[data-n]').onclick = () => { leaving = true; try { localStorage.removeItem(SAVE); } catch {} location.reload(); };
  });
}
function showVictory(w) {
  try { localStorage.removeItem(SAVE); } catch {}
  modal(`<img src="${flagSrc(w)}" alt="" style="width:140px;border-radius:8px"><h2>${w === G.me ? '¡CONQUISTASTE EL MUNDO!' : `¡${up(name(w))} CONQUISTÓ EL MUNDO!`}</h2><p>${dateOf(G.day)}</p>
    <div class="acts"><button class="btn primary" data-n>NUEVA PARTIDA</button></div>`, el => { el.querySelector('[data-n]').onclick = () => { leaving = true; location.reload(); }; });
}
function showHelp() {
  const was = speed; setSpeed(0);
  modal(`<h2>CÓMO SE JUEGA</h2><div class="steps">
    <div><span>🏆</span>Ganás cuando controlás <b>la mitad del PBI mundial</b>. Perdés si caen tu capital y la mitad de tu territorio.</div>
    <div><span>⏱️</span>El tiempo corre solo. Arriba pausás (❚❚) o acelerás (1× a 8×).</div>
    <div><span>⚔️</span>Tus tropas son <b>escuadrones</b>: círculos con tu bandera y la cantidad de soldados. Tocá uno (o arrastrá un recuadro en computadora, o TODOS) y después tocá el mapa para mandarlo.</div>
    <div><span>🗺️</span>Un escuadrón en territorio enemigo <b>va pintando con tu bandera</b> lo que pisa, si no hay tropas enemigas cerca. Si se cruza con un escuadrón enemigo, pelean (destellos amarillos).</div>
    <div><span>🤖</span>AVANCE AUTOMÁTICO hace que el escuadrón avance solo contra el enemigo más cercano.</div>
    <div><span>💰</span>En PRESUPUESTO repartís tu PBI: social, investigación, militar (produce soldados solos) y liquidez (ahorro). Si gastás más del 22 % del PBI la economía crece menos.</div>
    <div><span>🔬</span>Con los puntos de investigación desbloqueás mejoras, compras de a ×100 (Industria), misiles y la bomba nuclear. Las bombas se fabrican de a una (EJÉRCITO) y se tiran con el botón ☢️.</div>
    <div><span>📊</span>Arriba, el botón 📊 muestra el poder, PBI, población y más de todos los países.</div>
    <div><span>⚠️</span>Si conquistás muy rápido, los demás forman una <b>coalición</b> contra vos.</div>
    <div><span>🎲</span>Una vez por año vas a tener que tomar una decisión importante.</div></div>
    <div class="acts"><button class="btn primary" data-ok>ENTENDIDO</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = () => { close(); setSpeed(was); }; });
}
$('btnHelp').onclick = showHelp;
$('btnNuke').onclick = () => { if (nukeMode) { nukeMode = false; updateNukeBtn(); toast('Bomba guardada'); } else armNuke(); };
/* estadísticas de todos los países */
let statSort = 'pow', statFilter = 'all', statWas = 0;
const STAT_COLS = [['rk', '#'], ['name', 'PAÍS'], ['pow', '⚔️ PODER'], ['sold', '🪖 SOLDADOS'], ['q', '⭐ CALIDAD'], ['gdp', '📈 PBI'], ['share', '🏆 % PBI MUNDIAL'],
  ['pop', '👥 POBLACIÓN'], ['land', '🗺️ TERRITORIO'], ['qol', '🏠 VIDA'], ['stab', '🙂 ESTABILIDAD'], ['tech', '🔬 TECNOLOGÍAS'], ['rel', '🤝 RELACIÓN'], ['wars', '⚔️ GUERRAS'], ['nuk', '☢️']];
function statRows() {
  const me = G.me, wg = worldGdp(), nl = LAND.length;
  return alive().map(k => { const n = G.n[k];
    return { k, name: name(k), pow: power(k), sold: n.soldiers, q: quality(k), gdp: gdpOf(k), share: gdpOf(k) / wg * 100, pop: popOf(k), land: agg.cells[IDX[k]] / nl * 100,
      qol: avgQol(k), stab: n.stab, tech: Object.keys(n.techs).length, rel: G.n[me] && k !== me ? rel(me, k) : -1, wars: enemiesOf(k).length, nuk: n.techs.nuk ? n.nukes : -1 }; });
}
function renderStats() {
  const F = { all: 'Todos', top: 'Top 20', nb: 'Vecinos', war: 'En guerra conmigo', al: 'Aliados' }, me = G.me;
  $('statsFilter').innerHTML = Object.entries(F).map(([k, l]) => `<button data-sf="${k}" class="${statFilter === k ? 'on' : ''}">${l}</button>`).join('');
  $('statsFilter').querySelectorAll('[data-sf]').forEach(b => (b.onclick = () => { statFilter = b.dataset.sf; renderStats(); }));
  let rows = statRows();
  const rank = new Map(rows.slice().sort((a, b) => b.pow - a.pow).map((r, i) => [r.k, i + 1]));
  if (statFilter === 'nb' && G.n[me]) rows = rows.filter(r => r.k === me || landNeighbors(me).has(r.k));
  if (statFilter === 'war') rows = rows.filter(r => r.k === me || atWar(me, r.k));
  if (statFilter === 'al') rows = rows.filter(r => r.k === me || allied(me, r.k));
  rows.sort((a, b) => (statSort === 'name' ? a.name.localeCompare(b.name, 'es') : statSort === 'rk' ? rank.get(a.k) - rank.get(b.k) : b[statSort] - a[statSort]));
  if (statFilter === 'top') rows = rows.slice(0, 20);
  const pct = v => v.toFixed(v < 10 ? 1 : 0).replace('.', ',') + ' %';
  $('statsTbl').innerHTML = `<thead><tr>${STAT_COLS.map(([k, l]) => `<th data-sk="${k}" class="${statSort === k ? 'on' : ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="srow ${r.k === me ? 'mine' : ''}" data-k="${r.k}">
    <td class="rk">${rank.get(r.k)}</td><td><span class="c"><img src="${flagSrc(r.k)}" alt="">${r.name}</span></td><td>${fmtK(r.pow / 100)}</td><td>${fmtK(r.sold)}</td><td>×${r.q.toFixed(2)}</td>
    <td>${money(r.gdp)}</td><td>${pct(r.share)}</td><td>${fmtK(r.pop)}</td><td>${pct(r.land)}</td><td>${Math.round(r.qol)}</td><td>${Math.round(r.stab)} %</td><td>${r.tech}/${TECH.length}</td>
    <td class="${r.rel >= 60 ? 'pos' : r.rel >= 0 && r.rel < 30 ? 'neg' : ''}">${r.rel < 0 ? '—' : r.rel}</td><td class="${r.wars ? 'neg' : ''}">${r.wars || '—'}</td><td>${r.nuk < 0 ? '—' : r.nuk}</td></tr>`).join('')}</tbody>`;
  $('statsTbl').querySelectorAll('[data-sk]').forEach(th => (th.onclick = () => { statSort = th.dataset.sk; renderStats(); }));
  $('statsTbl').querySelectorAll('tr[data-k]').forEach(tr => (tr.onclick = () => { closeStats(); openCountry(tr.dataset.k); }));
}
function openStats() { if (!G) return; statWas = speed; setSpeed(0); $('stats').hidden = false; renderStats(); }
function closeStats() { $('stats').hidden = true; setSpeed(statWas); }
$('btnStats').onclick = openStats; $('statsClose').onclick = closeStats;
$('stats').addEventListener('pointerdown', e => { if (e.target.id === 'stats') closeStats(); });
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
  G = newGame(PLAYABLE[0]); rebuildWarSet(); recomputeAgg(); rebuildFrontiers(); syncSoldiers();
  RANK = PLAYABLE.map(k => [k, strengthScore(k)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const parts = {}; PLAYABLE.forEach(k => (parts[k] = strengthParts(k)));
  const mP = Math.max(...PLAYABLE.map(k => parts[k].P)), mG = Math.max(...PLAYABLE.map(k => parts[k].gdp)), mA = Math.max(...PLAYABLE.map(k => parts[k].allies)) || 1;
  PLAYABLE.forEach(k => { const s = parts[k];
    FACT[k] = { mil: 100 * Math.log10(s.P + 1) / Math.log10(mP + 1), eco: 100 * Math.log10(s.gdp * 1000 + 1) / Math.log10(mG * 1000 + 1), qol: s.qol,
      al: s.allies ? 100 * Math.log10(s.allies + 1) / Math.log10(mA + 1) : 0, th: s.threat ? clamp(100 * Math.log10(1 + s.threat / (s.P + 1)) / 1.5, 3, 100) : 0 }; });
  G = null; resetCells();
  const list = $('pickList');
  const draw = () => {
    const q = $('pickSearch').value.trim().toLowerCase();
    list.innerHTML = RANK.map((k, i) => [k, i]).filter(([k]) => !q || name(k).toLowerCase().includes(q)).map(([k, i]) => { const [d, l] = difficulty(i);
      return `<button class="prow ${pickSel === k ? 'on' : ''}" data-k="${k}" role="option"><span class="rk">#${i + 1}</span><img src="${flagSrc(k)}" alt=""><span>${name(k)}</span><span class="diff d${d}">${l}</span></button>`; }).join('');
    list.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => choose(b.dataset.k)));
  };
  $('pickSearch').oninput = draw; draw(); pickDraw = draw;
  let s = null; try { s = JSON.parse(localStorage.getItem(SAVE)); } catch {}
  $('btnLoad').hidden = !s;
  $('btnLoad').onclick = () => { G = loadGame(s); startGame(); };
  $('btnStart').onclick = () => { G = newGame(pickSel); startGame(); };
}
let pickDraw = () => {};
function choose(k) {
  pickSel = k; $('btnStart').disabled = false; pickDraw();
  const i = RANK.indexOf(k), [d, l] = difficulty(i), q = Q[k], f = FACT[k];
  $('pickInfo').innerHTML = `<b style="color:#fff">${name(k)}</b> · ${IDEO[IDEO0[k] || 'dem'].n} · puesto #${i + 1} · <span class="diff d${d}">${l}</span>
    <div class="factors">
      <span>⚔️ Ejército</span>${bar(f.mil, 'var(--red)')}<span>${fmtK(q.mil[0] * 1000)} sold.</span>
      <span>📈 Economía</span>${bar(f.eco, 'var(--blue)')}<span>${money(q.gdp)}</span>
      <span>🏠 Calidad de vida</span>${bar(f.qol)}<span>${Math.round(f.qol)}/100</span>
      <span>🤝 Aliados</span>${bar(f.al, 'var(--green)')}<span>${f.al ? 'sí' : 'ninguno'}</span>
      <span>☠️ Amenazas</span>${bar(f.th, 'var(--red)')}<span>${f.th > 60 ? 'altas' : f.th > 25 ? 'medias' : f.th ? 'bajas' : 'ninguna'}</span>
    </div>`;
  const el = $('pickList').querySelector(`[data-k="${k}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
  flyTo(RBB[IDX[k]], 3); dirty = true;
}
function startGame() {
  $('pick').hidden = true; $('hud').hidden = false;
  $('meFlag').src = flagSrc(G.me); $('meName').textContent = name(G.me);
  document.querySelector('#sFund').previousElementSibling.textContent = '🪖 SOLDADOS';
  document.querySelector('#sPower').previousElementSibling.textContent = '🏆 PBI MUNDIAL';
  rebuildWarSet(); recomputeAgg(); updatePeaks(); rebuildMulti(); rebuildFrontiers(); syncSoldiers(); maskCache.clear(); dirty = true;
  if (!G.n[G.me]) showDefeat(G.dead || alive()[0]); else flyTo(RBB[IDX[G.me]], 1.4);
  hud(); setSpeed(0);
  history.pushState({ game: 1 }, ''); // el gesto de "atrás" abre el menú en vez de sacarte del juego
  addEventListener('popstate', () => { if (leaving) return; history.pushState({ game: 1 }, ''); openMenu(); });
  if (G.day === 0) modal(`<h2>${up(name(G.me))}</h2><p>1 de enero de 2027. La guerra de Rusia en Ucrania sigue abierta y la tensión mundial crece. <b>Ganás cuando controlás la mitad del PBI mundial.</b></p>
    <div class="steps"><div><span>⚔️</span>Tus tropas son los círculos con tu bandera. Tocá uno y después tocá el mapa para moverlo.</div>
    <div><span>🗺️</span>En territorio enemigo tus escuadrones van pintando el mapa con tu bandera.</div>
    <div><span>👇</span>Abajo: PAÍS, EJÉRCITO, PRESUPUESTO, INVESTIGAR, DIPLOMACIA y GOBIERNO. Tocá cualquier país para declararle la guerra.</div></div>
    <div class="acts"><button class="btn primary" data-ok>EMPEZAR</button></div>`, (el, close) => { el.querySelector('[data-ok]').onclick = () => { close(); setSpeed(1); }; });
}

/* ======================= ENTRADA ======================= */
const ptrs = new Map(); let drag = null, moved = 0;
mapCv.addEventListener('pointerdown', e => { mapCv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
  drag = { x: cam.x, y: cam.y, sx: e.clientX, sy: e.clientY, s: cam.s, d: null, boxMode: e.shiftKey || e.button === 2 }; anim = null; });
mapCv.addEventListener('contextmenu', e => e.preventDefault());
mapCv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  const P = [...ptrs.values()];
  if (P.length === 2) { const d = wdist(P[0], P[1]); if (!drag.d) { drag.d = d; drag.s = cam.s; } cam.s = drag.s * d / drag.d; moved = 99; clampCam(); return; }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; moved = Math.max(moved, Math.hypot(dx, dy));
  if (drag.boxMode && G) { box = [Math.min(drag.sx, e.clientX), Math.min(drag.sy, e.clientY), Math.max(drag.sx, e.clientX), Math.max(drag.sy, e.clientY)]; return; }
  if (moved > 6) { mapCv.classList.add('dragging'); cam.x = drag.x - dx / cam.s; cam.y = drag.y - dy / cam.s; clampCam(); }
});
function tap(x, y) {
  if (!G) { const i = hitRegion(x, y); if (i >= 0) choose(PLAYABLE[cellC[i]]); return; }
  if (nukeMode) {
    const i = hitRegion(x, y), k = i >= 0 ? PLAYABLE[owner[i]] : null;
    if (!k || !atWar(G.me, k)) return toast('Tiene que ser territorio de un país con el que estés en guerra');
    const wx = cam.x + (x - vw / 2) / cam.s, wy = cam.y + (y - vh / 2) / cam.s;
    return confirmBox(`☢️ ¿Tirar la bomba sobre ${name(k)}?`, 'Arrasa todo en un radio enorme y aniquila las tropas enemigas cercanas. Todos los países te van a odiar.', 'TIRARLA', () => {
      G.n[G.me].nukes--; nukeMode = false; detonate(G.me, wx, wy); updateNukeBtn(); hud(); });
  }
  const tok = tokens.slice().reverse().find(t => Math.hypot(x - t.x, y - t.y) <= t.r);
  if (tok && tok.s.o === G.me) { if (selected.has(tok.s.id)) selected.delete(tok.s.id); else selected.add(tok.s.id); closeSheet(); renderArmyBar(); return; }
  if (tok && atWar(tok.s.o, G.me) && has(G.me, 'mis') && !selected.size) return missileAt(tok.s);
  const i = hitRegion(x, y);
  if (selected.size) { if (i >= 0) orderTo(i); else { const wx = cam.x + (x - vw / 2) / cam.s, wy = cam.y + (y - vh / 2) / cam.s; if (!shipsOK(G.me)) return toast('Para ir por mar necesitás al menos 3 buques de guerra'); selSquads().forEach(s => { s.tx = wx; s.ty = wy; s.auto = false; }); } return; }
  if (i >= 0) openCountry(PLAYABLE[owner[i]]);
}
function missileAt(s) {
  const n = G.n[G.me], c = Math.max(1, gdpOf(G.me) * .002);
  if (G.day - n.misDay < 10) return toast(`Los misiles se recargan el ${dateOf(n.misDay + 10)}`);
  confirmBox(`🚀 ¿Misiles contra ${name(s.o)}?`, `Destruye ~30 % de este escuadrón de ${fmtInt(s.n)} soldados. Cuesta ${money(c)} del tesoro.`, 'LANZAR', () => {
    if (n.treasury < c) return toast('No alcanza el tesoro'); n.treasury -= c; n.misDay = G.day; s.n *= .7; news(`🚀 Misiles contra ${name(s.o)}`, '', true);
  });
}
const endPtr = e => {
  ptrs.delete(e.pointerId); mapCv.classList.remove('dragging');
  if (box) { const [a, b, c, d] = box; box = null; if (c - a > 8 || d - b > 8) { tokens.forEach(t => { if (t.s.o === G.me && t.x >= a && t.x <= c && t.y >= b && t.y <= d) selected.add(t.s.id); }); renderArmyBar(); } return; }
  if (ptrs.size === 0 && moved <= 6 && e.type === 'pointerup') tap(e.clientX, e.clientY);
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: cam.x, y: cam.y, sx: p[0], sy: p[1], s: cam.s, d: null }; }
};
mapCv.addEventListener('pointerup', endPtr); mapCv.addEventListener('pointercancel', endPtr);
mapCv.addEventListener('wheel', e => {
  e.preventDefault(); anim = null;
  const f = Math.exp(-e.deltaY * .0015), wx = cam.x + (e.clientX - vw / 2) / cam.s, wy = cam.y + (e.clientY - vh / 2) / cam.s;
  cam.s *= f; clampCam(); cam.x = wx - (e.clientX - vw / 2) / cam.s; cam.y = wy - (e.clientY - vh / 2) / cam.s; clampCam();
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
let lastTouch = 0;
document.addEventListener('touchend', e => { const now = Date.now(); if (now - lastTouch < 350 && !e.target.closest('input')) e.preventDefault(); lastTouch = now; }, { passive: false });
addEventListener('keydown', e => { if (G && e.code === 'Space' && !modalOpen && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpeed(speed ? 0 : 1); } if (e.code === 'Escape') { selected.clear(); nukeMode = false; renderArmyBar(); updateNukeBtn(); if (!$('stats').hidden) closeStats(); } });

/* ======================= BUCLE ======================= */
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.min(250, now - last); last = now;
  if (anim && !anim(now)) anim = null;
  if (G && (G.n[G.me] || G.dead)) {
    if (speed && !modalOpen) {
      acc += dt; const per = 700 / speed; let n = 0;
      while (acc >= per && n++ < 4) { acc -= per; dayTick(); }
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
window.__conq = { nukeAt: (wx, wy) => { const [x, y] = toScreen(wx, wy); nukeMode = true; tap(x, y); }, get G() { return G; }, set G(v) { G = v; }, power, quality, rel, dayTick, declareWar, gdpOf, worldGdp, newGame, strengthScore, buy, orderTo, randomEvent, EVENTS,
  start: k => { G = newGame(k); rebuildWarSet(); recomputeAgg(); updatePeaks(); rebuildMulti(); rebuildFrontiers(); syncSoldiers(); }, owner, cellsOf, IDX, LAND, selected, sqOf, autoTarget, flip, NC };
})();
