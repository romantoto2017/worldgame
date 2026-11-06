// Genera game/data.js (mapa + países + vecinos). Uso: NODE_PATH=<node_modules> node tools/build-data.js
const fs = require('fs'), path = require('path');
const topo = JSON.parse(JSON.stringify(require('world-atlas/countries-50m.json')));
const { feature } = require('topojson-client');
const wc = require('world-countries');
const popList = require('country-json/src/country-by-population.json');

const OUT = path.join(__dirname, '..', 'game');
const byN = {}; wc.forEach(c => (byN[c.ccn3] = c));
const pop = {}; popList.forEach(p => (pop[p.country.toLowerCase()] = p.population));
// nombres que no coinciden entre datasets
const POP_FIX = { 'Ivory Coast': 23e6, 'DR Congo': 84e6, 'Republic of the Congo': 5.2e6, 'Czechia': 10.6e6, 'Eswatini': 1.1e6,
  'Cape Verde': 543767, 'North Macedonia': 2.08e6, 'Vatican City': 800, 'Palestine': 4.6e6, 'South Sudan': 10.9e6, 'Timor-Leste': 1.27e6,
  'Micronesia': 112640, 'Myanmar': 53.7e6, 'São Tomé and Príncipe': 211028, 'Taiwan': 23.6e6, 'Bahamas': 385637, 'Gambia': 2.28e6,
  'Kosovo': 1.8e6, 'Türkiye': 84.3e6, 'Fiji': 896444, 'North Korea': 25.5e6, 'South Korea': 51.6e6, 'Russia': 144.5e6, 'Syria': 16.9e6, 'Laos': 7.06e6, 'Vietnam': 95.5e6,
  'Iran': 81.8e6, 'Brunei': 428963, 'Moldova': 2.7e6, 'Bolivia': 11.35e6, 'Venezuela': 28.9e6, 'Tanzania': 56.3e6, 'Macedonia': 2.08e6 };
const MERGE = { Somaliland: '706', 'N. Cyprus': '196', 'Siachen Glacier': '356' }; // se asignan a Somalia, Chipre, India

const geoms = topo.objects.countries.geometries;
const countries = {}; // code -> info
for (const g of geoms) {
  let id = g.id;
  if (!id && MERGE[g.properties.name]) id = MERGE[g.properties.name];
  const c = byN[id];
  let code, info;
  if (g.properties.name === 'Kosovo') {
    code = 'xk'; info = { code, name: 'Kosovo', pop: 1.8e6, area: 10887, playable: true, borders: ['SRB', 'MNE', 'ALB', 'MKD'] , cca3: 'UNK' };
  } else if (c) {
    code = c.cca2.toLowerCase();
    const p = POP_FIX[c.name.common] ?? pop[c.name.common.toLowerCase()] ?? pop[c.name.official.toLowerCase()];
    info = { code, name: c.translations.spa.common, pop: p, area: c.area, playable: !!c.independent && p != null, borders: c.borders, cca3: c.cca3 };
    if (c.independent && p == null) console.warn('sin población:', c.name.common);
  } else { code = 'x' + (g.properties.name || 'na').replace(/\W/g, '').toLowerCase(); info = { code, name: g.properties.name, playable: false }; }
  g.properties = { c: code };
  delete g.id;
  if (!countries[code]) countries[code] = info;
}
// fusionar geometrías con el mismo código (Somalia+Somaliland, etc.)
const merged = {};
topo.objects.countries.geometries = geoms.filter(g => {
  const k = g.properties.c;
  if (!merged[k]) { merged[k] = g; return true; }
  const a = merged[k];
  const arcsOf = x => x.type === 'Polygon' ? [x.arcs] : x.type === 'MultiPolygon' ? x.arcs : [];
  a.arcs = arcsOf(a).concat(arcsOf(g)); a.type = 'MultiPolygon';
  return false;
});
// Antártida fuera
topo.objects.countries.geometries = topo.objects.countries.geometries.filter(g => countries[g.properties.c].name !== 'Antártida');

// vecinos: fronteras terrestres + cercanía marítima (< 350 km)
const feats = feature(topo, topo.objects.countries).features.filter(f => countries[f.properties.c].playable);
const pts = {}, bb = {};
for (const f of feats) {
  const k = f.properties.c, arr = [];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) for (const ring of p) for (const pt of ring) arr.push(pt);
  pts[k] = arr;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of arr) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  bb[k] = [x0, y0, x1, y1];
}
const km = (a, b) => { const r = Math.PI / 180, dl = Math.abs(a[0] - b[0]), dx = Math.min(dl, 360 - dl) * Math.cos((a[1] + b[1]) / 2 * r), dy = a[1] - b[1]; return Math.hypot(dx, dy) * 111.2; };
const cca3to = {}; Object.values(countries).forEach(c => c.cca3 && (cca3to[c.cca3] = c.code));
const keys = Object.keys(pts), near = {};
for (const a of keys) near[a] = [];
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const a = keys[i], b = keys[j], A = bb[a], B = bb[b];
  if (A[2] - A[0] < 180 && B[2] - B[0] < 180 && (A[0] - 25 > B[2] || B[0] - 25 > A[2] || A[1] - 25 > B[3] || B[1] - 25 > A[3])) continue;
  let best = 1e9; const pa = pts[a], pb = pts[b], sa = Math.max(1, pa.length >> 9), sb = Math.max(1, pb.length >> 9);
  for (let x = 0; x < pa.length; x += sa) for (let y = 0; y < pb.length; y += sb) { const d = km(pa[x], pb[y]); if (d < best) best = d; }
  near[a].push([b, best]); near[b].push([a, best]);
}
for (const k of keys) {
  const c = countries[k], set = new Set((c.borders || []).map(x => cca3to[x]).filter(x => x && pts[x]));
  near[k].sort((x, y) => x[1] - y[1]);
  // marítimo: < 150 km siempre; islas sin fronteras terrestres buscan hasta 400 km y al menos 2 rivales
  const few = set.size === 0;
  near[k].filter(([, d]) => d < (few ? 400 : 150)).forEach(([b]) => set.add(b));
  if (few) for (const [b] of near[k]) { if (set.size >= 2) break; set.add(b); }
  c.adj = [...set];
}
for (const k of keys) for (const b of countries[k].adj) if (!countries[b].adj.includes(k)) countries[b].adj.push(k); // simétrico
for (const c of Object.values(countries)) { delete c.borders; delete c.cca3; }

// banderas SVG (vectoriales: nítidas a cualquier resolución)
// proporciones oficiales (svg-country-flags); flag-icons solo como respaldo (viene recortado a 4:3)
const flagDir = path.join(path.dirname(require.resolve('svg-country-flags/package.json')), 'svg');
const flagFallback = path.join(path.dirname(require.resolve('flag-icons/package.json')), 'flags', '4x3');
for (const c of Object.values(countries)) if (c.playable) {
  let f = path.join(flagDir, c.code + '.svg');
  if (!fs.existsSync(f)) { console.warn('bandera de respaldo:', c.code); f = path.join(flagFallback, c.code + '.svg'); }
  let svg = fs.readFileSync(f, 'utf8');
  const vb = svg.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (!vb) throw new Error('sin viewBox: ' + c.code);
  c.ar = +(vb[1] / vb[2]).toFixed(4);
  // ancho/alto explícitos: sin ellos el navegador rasteriza a 300×150 y deforma la bandera
  const h = 1000, w = Math.round(h * c.ar);
  svg = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => '<svg' + attrs.replace(/\s(width|height)="[^"]*"/g, '') + ` width="${w}" height="${h}" preserveAspectRatio="none">`);
  fs.writeFileSync(path.join(OUT, 'flags', c.code + '.svg'), svg);
}

const playable = Object.values(countries).filter(c => c.playable).length;
console.log('jugables:', playable, 'total:', Object.keys(countries).length);
fs.writeFileSync(path.join(OUT, 'data.js'), 'window.EMPIRE_DATA=' + JSON.stringify({ topo, countries }) + ';\n');
