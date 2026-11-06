/* EMPIRE — modo ruleta mundial */
(() => {
'use strict';
const D = window.EMPIRE_DATA, C = D.countries, topo = D.topo;
const geoms = topo.objects.countries.geometries;
const geomBy = {}; geoms.forEach(g => (geomBy[g.properties.c] = g));
const PLAYABLE = Object.keys(C).filter(k => C[k].playable && geomBy[k]);
const $ = id => document.getElementById(id);
const fmtInt = n => Math.round(n).toLocaleString('es-AR');
const up = s => s.toLocaleUpperCase('es');

/* ---------------- configuración ---------------- */
const CFG_KEY = 'empire.cfg', SAVE_KEY = 'empire.save';
const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const cfg = Object.assign({ speed: 1, sound: true, vol: 0.7 }, load(CFG_KEY));

/* ---------------- sonido (sintetizado, sin música) ---------------- */
const Sfx = (() => {
  let ac, master, nb;
  const ensure = () => {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
      ac = new A(); master = ac.createGain(); master.connect(ac.destination);
      nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    if (ac.state === 'suspended') ac.resume();
    master.gain.value = cfg.vol;
    return ac;
  };
  const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  const tone = (f, dur, { type = 'sine', vol = .3, at = 0, f2 } = {}) => {
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, 0.004, vol, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
  };
  const noise = (dur, { vol = .3, at = 0, type = 'bandpass', f = 2000, f2, q = 1, attack = .005 } = {}) => {
    const t = ac.currentTime + at, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.loop = true; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, attack, vol, dur); s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + .02);
  };
  const play = fn => (...a) => { if (!cfg.sound || !ensure()) return; fn(...a); };
  return {
    unlock: () => ensure(),
    // tic de ruleta: click seco con armónicos
    tick: play(() => { tone(1700, .035, { type: 'triangle', vol: .22 }); noise(.02, { vol: .18, type: 'highpass', f: 4000 }); }),
    // barrido de zoom
    whoosh: play((d = .7) => { noise(d, { vol: .35, f: 400, f2: 2600, q: .8, attack: d * .55 }); }),
    // aparece un cartel
    blip: play(() => { tone(2200, .16, { type: 'sine', vol: .25, f2: 700 }); }),
    count: play(() => tone(3200, .015, { type: 'square', vol: .05 })),
    // dado: traqueteo corto + golpe
    dice: play(() => { for (let i = 0; i < 5; i++) noise(.025, { vol: .32, at: i * .028, f: 2600 + Math.random() * 1500, q: 2 });
      tone(180, .08, { vol: .35, f2: 90, at: .12 }); noise(.05, { vol: .25, at: .12, f: 1200, q: 1 }); }),
    ding: play(() => { tone(1320, .35, { vol: .2 }); tone(1980, .3, { vol: .12 }); }),
    win: play(() => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .32, { type: 'triangle', vol: .26, at: i * .075 }));
      noise(.5, { vol: .12, at: .25, type: 'highpass', f: 6000 }); }),
    conquer: play(() => { noise(.6, { vol: .35, f: 2600, f2: 300, q: .7, attack: .05 }); tone(130, .5, { vol: .4, f2: 45, at: .05 }); }),
    board: play(() => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, { vol: .12, at: i * .06 })); }),
  };
})();

/* ---------------- reloj del juego (pausa + velocidad) ---------------- */
let clock = 0, last = performance.now(), paused = false, runId = 0;
let waiters = [], tweens = [];
const wait = ms => { const id = runId; return new Promise(r => waiters.push({ t: clock + ms, r, id })); };
const tween = (ms, fn, ease = easeIO) => { const id = runId; return new Promise(r => tweens.push({ t0: clock, ms, fn, ease, r, id })); };
function easeIO(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
const easeOut = k => 1 - Math.pow(1 - k, 3);
function abortRun() { runId++; waiters = []; tweens = []; }

/* ---------------- proyección y geometría ---------------- */
const W = 2000, LATMAX = 84, LATMIN = -58;
const my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const Y0 = my(LATMAX), H = (Y0 - my(LATMIN)) / (2 * Math.PI) * W;
const proj = (lon, lat) => [(lon + 180) / 360 * W, (Y0 - my(Math.max(-80, Math.min(LATMAX, lat)))) / (2 * Math.PI) * W];

function partsOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.map(poly => {
    const path = new Path2D(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    poly.forEach((ring, ri) => {
      let off = 0, prev = null; // desenrollar anillos que cruzan el antimeridiano (evita franjas de lado a lado)
      ring.forEach(([lo, la], i) => { if (prev != null) { if (lo + off - prev > 180) off -= 360; else if (lo + off - prev < -180) off += 360; }
        prev = lo + off; const [x, y] = proj(lo + off, la); i ? path.lineTo(x, y) : path.moveTo(x, y);
        if (ri === 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } });
      path.closePath();
    });
    return { path, bb: [x0, y0, x1, y1], size: (x1 - x0) * (y1 - y0) };
  }).filter(p => p.size > 0);
}
// territorio fuera de juego (gris)
const grayPath = new Path2D();
geoms.forEach(g => { if (!C[g.properties.c].playable) partsOf(topojson.feature(topo, g).geometry).forEach(p => grayPath.addPath(p.path)); });
const regionParts = {}; PLAYABLE.forEach(k => (regionParts[k] = partsOf(topojson.feature(topo, geomBy[k]).geometry)));

const bbUnion = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const bbCenter = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const bbGrow = (b, f) => { const w = (b[2] - b[0]) * f, h = (b[3] - b[1]) * f; return [b[0] - w, b[1] - h, b[2] + w, b[3] + h]; };
const bbHit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/* ---------------- banderas ---------------- */
const flagSrc = c => `flags/${c}.svg`;
const flagImg = {}, flagLo = {}, flagHi = new Map();
function loadFlags() {
  return Promise.all(PLAYABLE.map(c => new Promise(res => {
    const img = new Image(); img.onload = () => {
      flagImg[c] = img;
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
      cv.getContext('2d').drawImage(img, 0, 0, 320, 240); flagLo[c] = cv; res();
    }; img.onerror = res; img.src = flagSrc(c);
  })));
}
// versión de alta resolución para los países en foco (nitidez al hacer zoom)
function hiFlag(c) {
  if (flagHi.has(c)) return flagHi.get(c);
  const img = flagImg[c]; if (!img) return flagLo[c];
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1536;
  cv.getContext('2d').drawImage(img, 0, 0, 2048, 1536);
  flagHi.set(c, cv); if (flagHi.size > 6) flagHi.delete(flagHi.keys().next().value);
  return cv;
}

/* ---------------- estado ---------------- */
let S; // { owner: {region: dueño}, st: {dueño: {pop, area, wins}}, battle }
function newState() {
  const st = {}, owner = {};
  PLAYABLE.forEach(k => { owner[k] = k; st[k] = { pop: C[k].pop, area: C[k].area, wins: 0 }; });
  return { owner, st, battle: 1 };
}
const alive = () => Object.keys(S.st);
const regionsOf = o => Object.keys(S.owner).filter(r => S.owner[r] === o);
function neighborsOf(o) {
  const set = new Set();
  regionsOf(o).forEach(r => C[r].adj.forEach(n => { const ow = S.owner[n]; if (ow && ow !== o) set.add(ow); }));
  return [...set];
}
// poder: escalón por población (1.0 – 1.5) + 0.1 por victoria (en décimas para evitar errores de coma flotante)
const basePow = pop => Math.max(10, Math.min(15, 11 + Math.floor(Math.log10(pop / 1e6) / 0.8)));
const powerOf = o => basePow(S.st[o].pop) + S.st[o].wins;
const bossOf = () => alive().reduce((a, b) => (S.st[b].area > S.st[a].area ? b : a));

// geometría fusionada de cada imperio (una bandera por masa de tierra contigua)
const ownerCache = {};
function ownerParts(o) {
  if (ownerCache[o]) return ownerCache[o];
  const regs = regionsOf(o);
  const parts = regs.length === 1 ? regionParts[o] : partsOf(topojson.merge(topo, regs.map(r => geomBy[r])));
  parts.sort((a, b) => b.size - a.size);
  const main = parts[0].bb, near = bbGrow(main, 1);
  let focus = main; parts.forEach(p => { if (bbHit(p.bb, near)) focus = bbUnion(focus, p.bb); });
  return (ownerCache[o] = { parts, main, focus });
}
let borderPath = null;
function invalidate(o) { delete ownerCache[o]; borderPath = null; dirty = true; }

/* ---------------- cámara y render ---------------- */
const mapCv = $('map'), fxCv = $('fx'), mctx = mapCv.getContext('2d'), fctx = fxCv.getContext('2d');
let vw = 0, vh = 0, dpr = 1, dirty = true;
const cam = { x: W / 2, y: H / 2, s: 1 };
const view = { top: 70, bottom: 280 }; // zona útil del mapa (debajo del encabezado, arriba del panel)
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
  [mapCv, fxCv].forEach(c => { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); });
  view.bottom = (vh <= 640 ? 250 : 280); dirty = true;
  if (!inGame) Object.assign(cam, worldCam());
}
addEventListener('resize', resize);
function camFor(bb, pad = 1.15, maxS = 60, minSize = 0) {
  if (minSize) { const w = bb[2] - bb[0], h = bb[3] - bb[1], gx = Math.max(0, minSize - w) / 2, gy = Math.max(0, minSize * .7 - h) / 2;
    bb = [bb[0] - gx, bb[1] - gy, bb[2] + gx, bb[3] + gy]; }
  const usableH = Math.max(120, vh - view.top - view.bottom);
  const w = Math.max(bb[2] - bb[0], 4), h = Math.max(bb[3] - bb[1], 4);
  const s = Math.min(maxS, vw / (w * pad), usableH / (h * pad));
  const [cx, cy] = bbCenter(bb);
  return { x: cx, y: cy + (view.bottom - view.top) / 2 / s, s }; // centrar en la zona libre entre encabezado y panel
}
const worldCam = () => camFor([0, 0, W, H], 1.02);
function flyTo(t, ms) {
  const a = { ...cam }, la = Math.log(a.s), lb = Math.log(t.s);
  return tween(ms, k => {
    const s = Math.exp(la + (lb - la) * k);
    // interpolar el centro en espacio de pantalla para que el zoom se sienta natural
    const w = (1 / s - 1 / a.s) / (1 / t.s - 1 / a.s || 1);
    const m = isFinite(w) && Math.abs(lb - la) > 1e-3 ? w : k;
    cam.x = a.x + (t.x - a.x) * m; cam.y = a.y + (t.y - a.y) * m; cam.s = s; dirty = true;
  });
}

const focus = { ids: [], dim: 0, white: 0 };
let fxState = { marker: null, black: null, wipe: null };

const flagMid = new Map();
function midFlag(c) {
  if (flagMid.has(c)) { const v = flagMid.get(c); flagMid.delete(c); flagMid.set(c, v); return v; }
  const img = flagImg[c]; if (!img) return flagLo[c];
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 768; cv.getContext('2d').drawImage(img, 0, 0, 1024, 768);
  flagMid.set(c, cv); if (flagMid.size > 30) flagMid.delete(flagMid.keys().next().value);
  return cv;
}
function drawFlagParts(ctx, o, parts, hi, x0, y0, x1, y1) {
  const big = !hi && parts.some(p => (p.bb[2] - p.bb[0]) * cam.s > 280);
  const img = hi ? hiFlag(o) : big ? midFlag(o) : (flagLo[o] || null);
  for (const p of parts) {
    const b = p.bb; if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
    if ((b[2] - b[0]) * cam.s < 0.6 && (b[3] - b[1]) * cam.s < 0.6) continue;
    ctx.save(); ctx.clip(p.path);
    if (img) ctx.drawImage(img, b[0], b[1], b[2] - b[0], b[3] - b[1]); else { ctx.fillStyle = '#555'; ctx.fill(p.path); }
    ctx.restore();
  }
}
function setWorldTransform(ctx) {
  const k = cam.s * dpr;
  ctx.setTransform(k, 0, 0, k, (vw / 2 - cam.x * cam.s) * dpr, (vh / 2 - cam.y * cam.s) * dpr);
}
function renderMap() {
  const ctx = mctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#101a27'; ctx.fillRect(0, 0, mapCv.width, mapCv.height);
  setWorldTransform(ctx);
  const x0 = cam.x - vw / 2 / cam.s, x1 = cam.x + vw / 2 / cam.s, y0 = cam.y - vh / 2 / cam.s, y1 = cam.y + vh / 2 / cam.s;
  // cuadrícula sutil
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1 / cam.s; ctx.beginPath();
  const step = W / 40;
  for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  ctx.fillStyle = '#3a4352'; ctx.fill(grayPath);
  const owners = alive();
  for (const o of owners) drawFlagParts(ctx, o, ownerParts(o).parts, false, x0, y0, x1, y1);
  if (!borderPath) { borderPath = new Path2D(); owners.forEach(o => ownerParts(o).parts.forEach(p => borderPath.addPath(p.path))); }
  ctx.strokeStyle = 'rgba(8,12,20,.55)'; ctx.lineWidth = 0.9 / cam.s; ctx.stroke(borderPath);
  // microestados: punto con bandera para que se vean en la vista mundial
  for (const o of owners) {
    const f = ownerParts(o).focus; if ((f[2] - f[0]) * cam.s > 7 || (f[3] - f[1]) * cam.s > 7) continue;
    const [cx, cy] = bbCenter(f); if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
    const r = 3.6 / cam.s; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    if (flagLo[o]) ctx.drawImage(flagLo[o], cx - r * 1.4, cy - r, r * 2.8, r * 2); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8 / cam.s; ctx.stroke();
  }
  // foco: oscurecer el resto y resaltar atacante/defensor
  if (focus.dim > 0) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(8,12,20,${0.62 * focus.dim})`;
    ctx.fillRect(0, 0, mapCv.width, mapCv.height); ctx.restore();
    for (const o of focus.ids) if (S.st[o]) {
      const P = ownerParts(o).parts; drawFlagParts(ctx, o, P, true, x0, y0, x1, y1);
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * focus.dim})`; ctx.lineWidth = 2.2 / cam.s; ctx.lineJoin = 'round';
      P.forEach(p => ctx.stroke(p.path));
    }
  }
}
function renderFx(now) {
  const ctx = fctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, fxCv.width, fxCv.height);
  setWorldTransform(ctx);
  const { marker, black, wipe } = fxState;
  if (black) {
    ctx.globalAlpha = black.a; ctx.fillStyle = '#04060a';
    black.parts.forEach(p => ctx.fill(p.path)); ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(255,255,255,${.5 * black.a})`; ctx.lineWidth = 1.2 / cam.s; black.parts.forEach(p => ctx.stroke(p.path));
  }
  if (wipe && wipe.r > 0) {
    const img = hiFlag(wipe.o);
    for (const p of wipe.parts) {
      ctx.save(); ctx.clip(p.path); ctx.beginPath(); ctx.arc(wipe.cx, wipe.cy, wipe.r, 0, 7); ctx.clip();
      ctx.drawImage(img, p.bb[0], p.bb[1], p.bb[2] - p.bb[0], p.bb[3] - p.bb[1]); ctx.restore();
    }
  }
  if (marker) {
    const pulse = (now / 600) % 1, r = (5 + 9 * pulse) / cam.s;
    ctx.beginPath(); ctx.arc(marker[0], marker[1], r, 0, 7); ctx.strokeStyle = `rgba(255,61,61,${1 - pulse})`; ctx.lineWidth = 2.5 / cam.s; ctx.stroke();
    ctx.beginPath(); ctx.arc(marker[0], marker[1], 4.5 / cam.s, 0, 7); ctx.fillStyle = '#ff3d3d'; ctx.fill();
    ctx.lineWidth = 1.8 / cam.s; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
}
function frame(now) {
  // tope alto: un cuadro lento no debe atrasar el reloj del juego
  const dt = Math.min(500, now - last); last = now;
  if (!paused) clock += dt * (inGame ? cfg.speed : 1);
  for (const tw of tweens.slice()) {
    const k = Math.min(1, (clock - tw.t0) / tw.ms); tw.fn(tw.ease(k));
    if (k >= 1) { tweens.splice(tweens.indexOf(tw), 1); tw.r(); }
  }
  for (const w of waiters.slice()) if (clock >= w.t) { waiters.splice(waiters.indexOf(w), 1); w.r(); }
  if (!inGame) { // fondo del menú: deriva lenta sobre el mapa
    const wc = worldCam(); cam.s = wc.s * 1.6; cam.x = W / 2 + Math.sin(now / 14000) * W * .18; cam.y = wc.y - 30; dirty = true;
  }
  if (dirty) { dirty = false; renderMap(); }
  renderFx(now);
  requestAnimationFrame(frame);
}

/* ---------------- UI del panel ---------------- */
const sideA = $('sideA'), sideD = $('sideD'), swords = $('swords'), dxp = $('dxp'), board = $('board'), battleEl = $('battle');
const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
const dieSVG = (v, red) => `<svg viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="20" fill="${red ? '#ff3d3d' : '#f4f6fa'}"/>` +
  PIPS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${red ? '#fff' : '#111'}"/>`).join('') + '</svg>';

function sideHTML(el, role) {
  el.className = 'side';
  el.innerHTML = `<div class="role">${role}</div><div class="flagbox"><div class="q">?</div></div><div class="name"></div>
    <div class="det off"><div class="pop"></div><div class="power"></div></div><div class="dice"></div><div class="total"></div>`;
}
function setFlag(el, o, cls) {
  const fb = el.querySelector('.flagbox'); let img = fb.querySelector('img');
  if (!img) { fb.innerHTML = ''; img = document.createElement('img'); img.alt = ''; fb.appendChild(img); }
  img.src = flagSrc(o); img.className = ''; void img.offsetWidth; if (cls) img.className = cls;
}
function setName(el, o) { el.querySelector('.name').textContent = o ? up(C[o].name) : ''; }
function addTag(el, cls, txt) { const t = document.createElement('span'); t.className = 'tag ' + cls; t.textContent = txt; el.querySelector('.flagbox').appendChild(t); }
function setDetails(el, o, pop) {
  const st = S.st[o], p = basePow(pop) + st.wins;
  el.querySelector('.pop').textContent = 'Pob. ' + fmtInt(pop);
  el.querySelector('.power').innerHTML = `PODER <b>×${(p / 10).toFixed(1)}</b>` +
    (st.wins ? `<span class="chip">${st.wins >= 3 ? '🔥 ' : ''}${st.wins} ${st.wins === 1 ? 'VICTORIA' : 'VICTORIAS'} +${(st.wins / 10).toFixed(1)}</span>` : '');
}
function setDiceSlots(el, n, redIdx) {
  el.querySelector('.dice').innerHTML = Array.from({ length: n }, (_, i) => `<div class="die" data-red="${i === redIdx ? 1 : ''}"></div>`).join('');
}
function showBattle() { battleEl.hidden = false; board.hidden = true; }

const callBox = $('callouts');
function callout(cls, title, cap) {
  const d = document.createElement('div'); d.className = 'call ' + cls;
  d.innerHTML = `<div class="pill">${title}</div><div class="cap">${cap}</div>`; callBox.appendChild(d); return d;
}
function clearCallouts() { [...callBox.children].forEach(c => { c.classList.add('out'); setTimeout(() => c.remove(), 450); }); }

function header() {
  $('subtitle').textContent = `TEMPORADA 1 · BATALLA ${S.battle}`;
  const lc = $('leftCount'); if (lc.textContent !== String(alive().length)) { lc.textContent = alive().length; const b = lc.parentElement; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
function fmtArea(a) { return a >= 1e6 ? (a / 1e6).toFixed(1) + 'M km²' : Math.round(a / 1e3) + 'K km²'; }
function showBoard() {
  battleEl.hidden = true; board.hidden = false;
  const os = alive();
  const wins = os.filter(o => S.st[o].wins > 0).sort((a, b) => S.st[b].wins - S.st[a].wins || S.st[b].pop - S.st[a].pop).slice(0, 5);
  const land = os.slice().sort((a, b) => S.st[b].area - S.st[a].area).slice(0, 5);
  const row = (o, i, v) => `<div class="lb" style="animation-delay:${.15 + i * .08}s"><span class="n">${i + 1}</span><img src="${flagSrc(o)}" alt=""><span class="nm">${C[o].name}</span><span class="v">${v}</span></div>`;
  board.innerHTML = `<h3>${os.length} PAÍSES RESTANTES</h3><div class="cols">
    <div><h4>MÁS VICTORIAS</h4>${wins.map((o, i) => row(o, i, S.st[o].wins)).join('') || '<div class="lb"><span></span><span></span><span class="nm" style="color:var(--muted)">—</span></div>'}</div>
    <div><h4>MÁS TERRITORIO</h4>${land.map((o, i) => row(o, i, fmtArea(S.st[o].area))).join('')}</div></div>`;
}

/* ---------------- secuencia de una batalla (~22 s a 1×, como los videos de referencia) ---------------- */
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const markerAt = o => (fxState.marker = bbCenter(ownerParts(o).main));

async function roulette(el, pool, chosen, n, base, extra) {
  const seq = shuffle(pool.slice());
  for (let t = 0; t < n; t++) {
    const o = t === n - 1 ? chosen : seq[t % seq.length];
    setFlag(el, o, t === n - 1 ? 'land' : 'spin'); setName(el, o); markerAt(o);
    if (el === sideD) { focus.ids = [S.cur.a, o]; dirty = true; }
    Sfx.tick();
    await wait(base + extra * Math.pow((t + 1) / n, 2));
  }
}

async function battle() {
  const os = alive();
  const attackers = os.filter(o => neighborsOf(o).length);
  if (os.length < 2 || !attackers.length) return finish();
  const a = pick(attackers), d = pick(neighborsOf(a));
  S.cur = { a, d };
  showBattle(); sideHTML(sideA, 'ATACANTE'); sideHTML(sideD, 'DEFENSOR');
  swords.setAttribute('class', 'swords'); dxp.classList.remove('on'); header();

  // 1) ruleta invisible: atacante
  await roulette(sideA, os, a, 16, 40, 300);
  hiFlag(a); focus.ids = [a]; dirty = true; // rasterizar la bandera grande ahora, no durante el zoom
  await wait(150);
  // 2) zoom al atacante
  Sfx.whoosh(.7);
  await Promise.all([flyTo(camFor(ownerParts(a).focus, 1.25, 60, 110), 1000), tween(600, k => { focus.dim = k; dirty = true; })]);
  await wait(450);
  // 3) ruleta: defensor entre los vecinos
  await roulette(sideD, neighborsOf(a), d, 12, 70, 280);
  hiFlag(d); fxState.marker = null;
  await wait(700);
  // 4) zoom cercano a la pelea
  // anclar en el más chico de los dos e incluir lo que rodea del otro
  const [dp, ap] = [ownerParts(d), ownerParts(a)].sort((x, y) => (x.main[2] - x.main[0]) * (x.main[3] - x.main[1]) - (y.main[2] - y.main[0]) * (y.main[3] - y.main[1]));
  const around = bbGrow(dp.main, 1.2); let bb = dp.main;
  ap.parts.forEach(p => { if (bbHit(p.bb, around)) bb = bbUnion(bb, [Math.max(p.bb[0], around[0]), Math.max(p.bb[1], around[1]), Math.min(p.bb[2], around[2]), Math.min(p.bb[3], around[3])]); });
  Sfx.whoosh(.8);
  await flyTo(camFor(bb, 1.15, 80, 55), 1000);

  // 5) carteles + datos
  const sa = S.st[a], sd = S.st[d], boss = bossOf();
  const ratio = sa.pop / sd.pop, rallyA = ratio <= 1 / 20, rallyD = ratio >= 20;
  const calls = [];
  if (boss === a || boss === d) calls.push(['boss', `${up(C[boss].name)}: JEFE`, 'El país más grande que queda en el mapa', boss, 'JEFE']);
  [a, d].forEach(o => { const w = S.st[o].wins; if (w >= 3) calls.push(['streak', `${up(C[o].name)}: RACHA`, `${w} victorias seguidas → +${(w / 10).toFixed(1)} de poder`, o, 'RACHA']); });
  if (rallyA || rallyD) { const o = rallyA ? a : d, r = Math.round(rallyA ? 1 / ratio : ratio);
    calls.push(['rally', `${up(C[o].name)}: DADO EXTRA`, `${fmtInt(r)}× más chico → tira un dado extra`, o, 'DADO EXTRA']); }
  if (calls.length) Sfx.blip();
  calls.forEach(c => callout(c[0], c[1], c[2]));
  swords.classList.add('on');
  [[sideA, a], [sideD, d]].forEach(([el, o]) => { setName(el, o); el.querySelector('.det').classList.remove('off'); });
  let ct = 0;
  await tween(900, k => {
    setDetails(sideA, a, sa.pop * (.6 + .4 * k)); setDetails(sideD, d, sd.pop * (.6 + .4 * k));
    if (++ct % 5 === 0) Sfx.count();
  }, easeOut);
  setDetails(sideA, a, sa.pop); setDetails(sideD, d, sd.pop);
  await wait(1100);
  Sfx.tick(); clearCallouts();
  calls.forEach(c => addTag(c[3] === a ? sideA : sideD, c[0], c[4]));
  setDiceSlots(sideA, rallyA ? 4 : 3, rallyA ? 3 : -1); setDiceSlots(sideD, rallyD ? 4 : 3, rallyD ? 3 : -1);
  sideA.querySelector('.total').textContent = '0'; sideD.querySelector('.total').textContent = '0';
  await wait(1000);

  // 6) dados: alternados, uno por segundo
  const rolls = { a: [], d: [] }, order = [];
  for (let i = 0; i < 3; i++) order.push('a', 'd');
  if (rallyA) order.push('a'); if (rallyD) order.push('d');
  for (const s of order) {
    const el = s === 'a' ? sideA : sideD, i = rolls[s].length, die = el.querySelectorAll('.die')[i], red = die.dataset.red === '1';
    const v = 1 + Math.floor(Math.random() * 6);
    die.className = 'die full rolling'; Sfx.dice();
    for (let f = 0; f < 4; f++) { die.innerHTML = dieSVG(1 + Math.floor(Math.random() * 6), red); await wait(70); }
    die.innerHTML = dieSVG(v, red); die.className = 'die full landed'; rolls[s].push(v);
    const tot = el.querySelector('.total'); tot.textContent = rolls[s].reduce((x, y) => x + y, 0);
    tot.classList.remove('punch'); void tot.offsetWidth; tot.classList.add('punch');
    await wait(720);
    die.classList.remove('landed');
  }
  await wait(200);

  // 7) dados × poder
  const sumA = rolls.a.reduce((x, y) => x + y, 0), sumD = rolls.d.reduce((x, y) => x + y, 0);
  const pA = powerOf(a), pD = powerOf(d), tA = sumA * pA / 10, tD = sumD * pD / 10;
  Sfx.ding(); dxp.classList.add('on');
  const totA = sideA.querySelector('.total'), totD = sideD.querySelector('.total');
  totA.classList.add('final'); totD.classList.add('final');
  await tween(550, k => { totA.textContent = (sumA + (tA - sumA) * k).toFixed(1); totD.textContent = (sumD + (tD - sumD) * k).toFixed(1); }, easeOut);
  await wait(700);

  // 8) resultado (empate: resiste el defensor)
  const aWins = tA > tD, w = aWins ? a : d, l = aWins ? d : a;
  const [wEl, lEl] = aWins ? [sideA, sideD] : [sideD, sideA];
  wEl.classList.add('win'); lEl.classList.add('lose');
  wEl.querySelector('.role').textContent = 'GANADOR'; lEl.querySelector('.role').textContent = 'PERDEDOR';
  [totA, totD].forEach(t => t.classList.remove('final'));
  wEl.querySelector('.total').classList.add('punch');
  swords.classList.add(aWins ? 'winA' : 'winD');
  Sfx.win();
  const upset = S.st[w].pop < S.st[l].pop;
  if (upset) callout('upset', '¡SORPRESA!', '¡Ganó el más chico!');
  await wait(650);

  // 9) conquista: el perdedor se apaga y la bandera del ganador se expande
  const lParts = ownerParts(l).parts, lMain = ownerParts(l).main;
  fxState.black = { parts: lParts, a: 0 };
  Sfx.conquer();
  await tween(350, k => { fxState.black.a = k; });
  // aplicar conquista
  const ws = S.st[w], ls = S.st[l];
  regionsOf(l).forEach(r => (S.owner[r] = w));
  ws.pop += ls.pop; ws.area += ls.area; ws.wins += 1; delete S.st[l];
  invalidate(w); invalidate(l);
  const nParts = ownerParts(w).parts, [cx, cy] = bbCenter(lMain);
  fxState.wipe = { o: w, parts: lParts, cx, cy, r: 0 };
  const rMax = Math.max(lMain[2] - lMain[0], lMain[3] - lMain[1]) * .9 + 2 / cam.s;
  await tween(950, k => { fxState.wipe.r = rMax * k; }, easeOut);
  // ahora el imperio completo con su bandera unificada
  fxState.wipe = { o: w, parts: nParts, cx, cy, r: 1e6 };
  fxState.black = null;
  dirty = true;
  await wait(500);
  fxState.wipe = null; dirty = true;
  clearCallouts();

  // 10) vuelta al mapa mundial + tabla
  S.battle += 1;
  store(SAVE_KEY, { owner: S.owner, st: S.st, battle: S.battle });
  Sfx.whoosh(.6);
  await Promise.all([flyTo(worldCam(), 900), tween(700, k => { focus.dim = 1 - k; dirty = true; })]);
  focus.ids = [];
  header(); showBoard(); Sfx.board();
  await wait(1300);
  if (alive().length > 1) return battle();
  return finish();
}

/* ---------------- pantallas ---------------- */
let inGame = false;
const screens = ['home', 'config', 'game', 'end'];
const show = (...ids) => screens.forEach(s => ($(s).hidden = !ids.includes(s)));
function refreshHome() { $('btnContinue').hidden = !load(SAVE_KEY); $('btnPlay').textContent = load(SAVE_KEY) ? 'NUEVA PARTIDA' : 'JUGAR'; }
function toHome() {
  abortRun(); inGame = false; paused = false; $('paused').hidden = true;
  callBox.innerHTML = ''; fxState = { marker: null, black: null, wipe: null }; focus.ids = []; focus.dim = 0;
  if (S) S.cur = null;
  S = S || newState(); dirty = true; refreshHome(); show('home');
}
function start(saved) {
  Sfx.unlock();
  S = saved ? Object.assign(newState(), saved) : newState();
  if (!saved) store(SAVE_KEY, null);
  Object.keys(ownerCache).forEach(k => delete ownerCache[k]); borderPath = null;
  abortRun(); inGame = true; paused = false; $('paused').hidden = true;
  show('game'); Object.assign(cam, worldCam()); dirty = true; header(); showBoard();
  wait(1200).then(battle);
}
function finish() {
  const w = alive()[0]; store(SAVE_KEY, null);
  $('endFlag').src = flagSrc(w); $('endTitle').textContent = `¡${up(C[w].name)} DOMINA EL MUNDO!`;
  $('endSub').textContent = `${S.st[w].wins} victorias · ${S.battle - 1} batallas`;
  Sfx.win(); show('game', 'end');
}
function togglePause() { if (!inGame) return; paused = !paused; $('paused').hidden = !paused; $('btnPause').textContent = paused ? '▶' : '❚❚'; }

$('btnPlay').onclick = () => start(null);
$('btnContinue').onclick = () => start(load(SAVE_KEY));
$('btnConfig').onclick = () => { syncCfg(); show('home', 'config'); };
$('cfgClose').onclick = () => show('home');
$('cfgReset').onclick = () => { store(SAVE_KEY, null); refreshHome(); $('cfgReset').textContent = 'Partida borrada'; };
$('btnPause').onclick = togglePause;
$('btnMenu').onclick = toHome;
$('endNew').onclick = () => start(null);
$('endMenu').onclick = () => { S = newState(); toHome(); };
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } if (e.code === 'Escape' && inGame) toHome(); });

function syncCfg() {
  document.querySelectorAll('#cfgSpeed button').forEach(b => b.classList.toggle('on', +b.dataset.v === cfg.speed));
  $('cfgSound').checked = cfg.sound; $('cfgVol').value = cfg.vol; $('cfgReset').textContent = 'Borrar partida guardada';
}
document.querySelectorAll('#cfgSpeed button').forEach(b => (b.onclick = () => { cfg.speed = +b.dataset.v; store(CFG_KEY, cfg); syncCfg(); }));
$('cfgSound').onchange = e => { cfg.sound = e.target.checked; store(CFG_KEY, cfg); if (cfg.sound) Sfx.tick(); };
$('cfgVol').oninput = e => { cfg.vol = +e.target.value; store(CFG_KEY, cfg); };
$('cfgVol').onchange = () => Sfx.tick();

/* ---------------- arranque ---------------- */
S = newState();
resize(); refreshHome(); show('home');
requestAnimationFrame(frame);
loadFlags().then(() => { dirty = true; });

// autocomprobación de la fórmula de poder (valores observados en los videos de referencia)
console.assert([[800, 10], [422e3, 10], [1.24e6, 11], [2.3e6, 11], [13.7e6, 12], [34e6, 12], [64e6, 13], [143e6, 13], [365e6, 14]]
  .every(([p, v]) => basePow(p) === v), 'basePow no coincide con la referencia');
window.__empire = { get S() { return S; }, get clock() { return clock; }, neighborsOf, basePow };
})();
