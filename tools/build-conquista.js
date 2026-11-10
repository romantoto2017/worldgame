// Genera game/conquista-data.js: PBI, población, ejército real aproximado, región e idiomas por país.
// Uso: NODE_PATH=<node_modules con world-countries> node tools/build-conquista.js
// PBI: Banco Mundial (datasets/gdp, último año disponible). Población: datasets/population (último año).
const fs = require('fs'), path = require('path');
global.window = {}; require('../game/data.js');
const C = window.EMPIRE_DATA.countries;
const wc = require('world-countries');
const by2 = {}; wc.forEach(c => (by2[c.cca2.toLowerCase()] = c));
const latest = file => { const m = {}; fs.readFileSync(path.join(__dirname, 'raw', file), 'utf8').split('\n').slice(1).forEach(l => {
  const p = l.match(/^(?:"[^"]*"|[^,]*),([A-Z0-9]{3}),(\d{4}),([\d.eE+-]+)/); if (!p) return;
  const [, iso, y, v] = p; if (!m[iso] || +y >= m[iso][0]) m[iso] = [+y, +v]; }); return m; };
const GDP = latest('gdp.csv'), POP = latest('pop.csv');
// PBI en miles de millones USD cuando el Banco Mundial no tiene dato, es muy viejo o usa un tipo de cambio irreal (Cuba: tasa oficial 24 CUP/USD)
const GDP_FIX = { tw: 790, kp: 28, ve: 92, sy: 20, ye: 21, er: 2.3, cu: 33, lb: 18, af: 14, ss: 5, so: 11, mm: 64, xk: 10.4, ps: 17, va: 0.3, ir: 400 };
const POP_FIX = { tw: 23.4e6, xk: 1.6e6, va: 800 };

// ejército activo aprox. (fuentes públicas tipo Global Firepower 2024; cifras redondeadas):
// [soldados en miles, tanques, aviones de combate, artillería+lanzacohetes, helicópteros de ataque, buques de guerra], % del PBI en defensa
const MIL = {
  us: [[1330, 4650, 1850, 2600, 1000, 240], 3.4], ru: [[1320, 6000, 1200, 9000, 550, 150], 6.0], cn: [[2035, 5000, 1650, 6500, 280, 230], 1.7],
  in: [[1450, 4600, 820, 5000, 40, 140], 2.4], kr: [[500, 2300, 470, 6000, 110, 100], 2.8], gb: [[150, 230, 220, 150, 30, 60], 2.3],
  jp: [[250, 520, 450, 650, 120, 120], 1.4], tr: [[355, 2200, 330, 2100, 110, 110], 2.1], pk: [[650, 3700, 500, 4600, 55, 60], 2.8],
  it: [[165, 200, 200, 300, 55, 70], 1.6], fr: [[200, 220, 270, 160, 70, 90], 2.1], br: [[365, 440, 150, 900, 10, 60], 1.1],
  id: [[400, 330, 80, 500, 15, 100], 0.7], ir: [[610, 1900, 300, 3000, 20, 100], 2.5], eg: [[440, 3600, 460, 4000, 90, 140], 1.2],
  au: [[60, 60, 120, 60, 22, 40], 2.0], il: [[170, 1370, 330, 1200, 50, 60], 5.3], ua: [[900, 1300, 70, 2500, 30, 10], 30],
  de: [[180, 300, 220, 150, 50, 50], 2.0], es: [[125, 330, 140, 300, 20, 50], 1.3], pl: [[190, 600, 90, 600, 30, 30], 4.1],
  sa: [[260, 1100, 280, 900, 30, 60], 7.1], vn: [[480, 2500, 75, 3500, 10, 60], 2.3], th: [[360, 600, 100, 1000, 7, 60], 1.3],
  tw: [[170, 1100, 290, 2000, 90, 90], 2.5], kp: [[1300, 5800, 450, 15000, 20, 400], 20], ca: [[70, 80, 70, 150, 0, 40], 1.4],
  dz: [[140, 1500, 150, 1200, 50, 50], 4.8], gr: [[140, 1200, 230, 1100, 30, 70], 3.0], mx: [[270, 0, 60, 150, 0, 120], 0.7],
  ar: [[75, 230, 20, 150, 0, 25], 0.5], co: [[290, 0, 20, 100, 0, 60], 3.0], ve: [[110, 170, 40, 200, 10, 20], 1.0],
  cl: [[70, 300, 45, 300, 0, 20], 1.8], pe: [[80, 160, 25, 200, 15, 25], 1.1], cu: [[50, 900, 20, 1000, 15, 10], 3.0],
  ng: [[140, 300, 30, 400, 15, 50], 0.6], et: [[160, 400, 25, 500, 10, 0], 1.0], za: [[75, 200, 50, 200, 10, 15], 0.7],
  ma: [[200, 900, 80, 800, 15, 20], 4.0], iq: [[190, 350, 30, 500, 40, 10], 2.0], sy: [[170, 2000, 70, 2500, 20, 10], 4.0],
  ae: [[65, 400, 150, 400, 30, 40], 5.0], bd: [[160, 320, 45, 600, 0, 50], 1.0], mm: [[400, 600, 120, 1500, 10, 50], 3.5],
  ph: [[145, 0, 30, 250, 15, 30], 1.3], my: [[110, 50, 40, 200, 0, 40], 1.0], sg: [[50, 180, 100, 200, 17, 30], 3.0],
  se: [[25, 120, 90, 50, 0, 20], 2.0], no: [[25, 50, 50, 50, 0, 15], 1.9], fi: [[25, 200, 60, 700, 0, 20], 2.4],
  nl: [[40, 18, 40, 30, 28, 20], 2.0], be: [[25, 0, 40, 20, 0, 5], 1.3], ch: [[100, 130, 30, 130, 0, 0], 0.7],
  at: [[22, 50, 15, 60, 0, 0], 0.8], pt: [[27, 30, 20, 50, 0, 15], 1.5], ro: [[70, 400, 30, 600, 20, 15], 2.4],
  hu: [[40, 50, 15, 50, 10, 0], 2.1], cz: [[27, 30, 15, 50, 15, 0], 2.0], by: [[60, 500, 50, 800, 20, 0], 1.5],
  kz: [[70, 350, 100, 500, 20, 15], 1.0], az: [[65, 450, 40, 600, 25, 10], 5.0], am: [[45, 100, 15, 200, 15, 0], 4.0],
  ge: [[20, 100, 5, 100, 5, 0], 2.0], af: [[150, 50, 10, 200, 5, 0], 2.0], ly: [[60, 300, 30, 300, 10, 10], 3.0],
  ao: [[100, 300, 50, 300, 15, 10], 1.5], sd: [[100, 400, 30, 400, 20, 5], 2.0], nz: [[9, 0, 0, 20, 0, 10], 1.2],
  dk: [[15, 40, 30, 20, 0, 15], 2.0], ie: [[8, 0, 0, 20, 0, 5], 0.3], qa: [[16, 60, 50, 50, 20, 15], 4.0],
  kw: [[17, 300, 40, 200, 15, 10], 4.5], jo: [[100, 500, 50, 500, 20, 5], 4.5], om: [[40, 120, 25, 150, 0, 15], 5.0],
  lk: [[250, 60, 20, 200, 10, 20], 1.8], np: [[95, 0, 0, 50, 0, 0], 1.2], uz: [[50, 340, 40, 300, 20, 0], 3.0],
  tm: [[36, 650, 20, 500, 10, 10], 2.0], mn: [[10, 400, 0, 300, 0, 0], 0.8], la: [[30, 30, 0, 50, 0, 0], 0.3],
  kh: [[125, 250, 0, 300, 0, 10], 2.0], rs: [[28, 230, 30, 300, 15, 0], 2.5], bg: [[37, 90, 20, 200, 10, 10], 2.0],
  hr: [[15, 75, 12, 100, 0, 5], 1.8], sk: [[16, 30, 10, 40, 0, 0], 2.0], lt: [[23, 0, 0, 30, 0, 5], 3.0],
  lv: [[7, 0, 0, 20, 0, 5], 3.0], ee: [[7, 0, 0, 30, 0, 5], 3.2], bo: [[35, 50, 15, 50, 0, 0], 1.3],
  ec: [[40, 30, 15, 100, 0, 10], 2.0], uy: [[22, 15, 10, 30, 0, 5], 2.0], py: [[14, 5, 5, 20, 0, 0], 1.1],
  ke: [[25, 100, 20, 50, 5, 5], 1.2], tz: [[27, 50, 15, 100, 0, 5], 1.0], ug: [[45, 230, 15, 100, 5, 0], 2.0],
  cd: [[134, 150, 10, 200, 5, 0], 1.5], tn: [[35, 80, 20, 100, 0, 15], 2.5], ly2: null,
};
delete MIL.ly2;

const out = {}; const missing = [];
for (const [k, c] of Object.entries(C)) {
  if (!c.playable) continue;
  const w = by2[k] || {}, iso = k === 'xk' ? 'XKX' : w.cca3;
  let gdp = GDP_FIX[k] ?? (GDP[iso] ? GDP[iso][1] / 1e9 : null);
  if (gdp == null) { missing.push(k); gdp = 1; }
  const pop = POP_FIX[k] ?? (POP[iso] ? POP[iso][1] : c.pop);
  let mil = MIL[k] && MIL[k][0], milPct = MIL[k] ? MIL[k][1] : 1.5;
  if (!mil) { // estimación: soldados ~0.25 % de la población, equipo según el gasto militar
    const spend = gdp * milPct / 100; // miles de millones
    mil = [Math.max(0.5, Math.round(pop * 0.0025 / 1000)), Math.round(spend * 25), Math.round(spend * 8), Math.round(spend * 30), Math.round(spend * 3), Math.round(spend * 2)];
  }
  out[k] = { gdp: +gdp.toFixed(2), pop: Math.round(pop), reg: w.region || '', sub: w.subregion || '', lang: Object.keys(w.languages || {}), mil, milPct, ll: w.landlocked ? 1 : 0 };
}
if (missing.length) console.warn('sin PBI:', missing.join(' '));
fs.writeFileSync(path.join(__dirname, '..', 'game', 'conquista-data.js'), 'window.CONQ_DATA=' + JSON.stringify(out) + ';\n');
console.log('países:', Object.keys(out).length, 'con ejército real:', Object.keys(MIL).length);
