// Cathedral Lab's design page: your own cathedral as a handful of choices, its cross-section drawn with the line of thrust,
// and the verdict, in calm air and in a storm, as you change them. Build it in 3D sends the design to the 3D page in the
// address. The design and the challenges met are kept in the browser.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and its imports carry the same stamp.
// node tools/bump.js cathedral 0.x sets them all; tools/smoke.js checks them.
import * as Solver from '../../src/solver.js?v=0.10';
import { DEFAULT, LIMITS, PRESETS, CHALLENGES, REFS, clamp, decode, query, assess, summary, minCrown, lands } from '../../src/design.js?v=0.10';

const VERSION = '0.10';
const $ = id => document.getElementById(id);
$('version').textContent = 'v' + VERSION;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } } };
const Q = new URLSearchParams(location.search);
let D = Q.get('d') ? decode(Q.get('d'), Q.get('name')) : clamp(store.get('cathedral-lab.design') || DEFAULT);
let A = null;
const done = new Set(store.get('cathedral-lab.challenges') || []);
const colors = {};
const m = (v, d = 1) => `${(+v).toFixed(d)} m`;
const press = (el, v) => el.setAttribute('aria-pressed', String(v));

// ---------- The controls ----------
const SLIDERS = { crown: v => m(v), span: v => m(v), thick: v => m(v, 2), wall: v => m(v), bdepth: v => `${m(v)} deep`, bays: v => `${v}, ${Math.round(v * A.L)} m` };
for (const k of Object.keys(SLIDERS)) { const el = $(k); [el.min, el.max, el.step] = LIMITS[k]; el.oninput = () => set({ [k]: +el.value }); }
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => set({ [b.dataset.k]: b.dataset.k === 'shape' ? b.dataset.v : +b.dataset.v }));
$('chapels').onclick = () => set({ chapels: !D.chapels });
$('name').value = D.name;
$('name').oninput = () => { D = clamp({ ...D, name: $('name').value }); save(); };
$('presets').innerHTML = '<span class="sub">Start from</span>' + PRESETS.map(p => `<button data-p="${p.id}">${p.title}<span>${p.note}</span></button>`).join('');
$('presets').querySelectorAll('button').forEach(b => b.onclick = () => set({ ...PRESETS.find(p => p.id === b.dataset.p).d }));
$('storm').onclick = () => { press($('storm'), $('storm').getAttribute('aria-pressed') !== 'true'); draw(); };
$('share').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('saved').textContent = 'Link copied'; } catch (e) { $('saved').textContent = 'Copy the address to share it'; } setTimeout(() => $('saved').textContent = '', 2400); };

function set(change) { D = clamp({ ...D, ...change }); update(); }
function save() {
  store.set('cathedral-lab.design', D);
  const q = query(D); history.replaceState(null, '', `?${q}`); $('build').href = `../?b=yours&${q}`;
}
function update() {
  A = assess(D);
  $('crown').min = minCrown(D);
  for (const k of Object.keys(SLIDERS)) { $(k).value = D[k]; $('o-' + k).textContent = SLIDERS[k](D[k]); }
  document.querySelectorAll('.seg button').forEach(b => { press(b, String(D[b.dataset.k]) === b.dataset.v); b.disabled = b.dataset.k === 'tiers' && b.dataset.v === '2' && D.aisles === 2; });
  press($('chapels'), D.chapels); $('bd-row').hidden = !D.tiers;
  const [tone, label, msg] = summary(A); $('pill').className = `pill ${tone}`; $('pill').textContent = label; $('msg').textContent = msg;
  // where the vault ranks among the real ones
  const below = REFS.filter(([, h]) => h < A.crown).at(-1), above = REFS.find(([, h]) => h >= A.crown);
  $('nums').innerHTML = [
    ['Top of the vault', m(A.crown)],
    ['Outward push of the vault', A.ok ? `${Math.round(A.H)} kN/m` : 'none fits'],
    ['Thinnest vault that holds', m(A.tmin, 2)],
    ['Wind on the lee side, storm', `${Math.round(A.F)} kN/m`],
  ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('') + `<dt class="fine">${below && above ? `Higher than ${below[0]}, lower than ${above[0]}.` : below ? `Higher than ${below[0]}, higher than any vault ever built.` : `Lower than ${above[0]}.`} Forces per metre of the nave.</dt>`;
  gauge($('g-wall'), 'Wall', A.calm.wall, A.storm.wall, A.ok);
  gauge($('g-butt'), 'Buttress', A.calm.buttress, A.storm.buttress, A.ok && !!A.calm.buttress);
  challenges(); save(); draw();
}
function gauge(el, title, c, s, show) {
  el.hidden = !show; if (!show) return;
  const pos = x => Math.max(-0.1, Math.min(1.1, x.e)) * 100;
  const [tone, word] = c.verdict === 'overturns' ? ['bad', 'tips'] : s.verdict === 'overturns' ? ['bad', 'tips in the storm'] : c.verdict === 'cracks' || s.verdict === 'cracks' ? ['warn', 'a joint opens'] : ['good', 'presses down'];
  el.innerHTML = `<div class="lab"><b>${title}: where the push lands</b><span style="color:var(--${tone})">${word}</span></div>
    <div class="track"><div class="third"></div><div class="mark" style="left:${pos(c)}%" title="Calm air: ${lands(c)}"></div><div class="mark storm" style="left:${pos(s)}%" title="In the storm: ${lands(s)}"></div></div>
    <div class="ends"><span>outer face</span><span>inner face</span></div>`;
}
function challenges() {
  const fresh = CHALLENGES.filter(c => c.test(A) && !done.has(c.id));
  fresh.forEach(c => done.add(c.id));
  if (fresh.length) { store.set('cathedral-lab.challenges', [...done]); $('saved').textContent = `Challenge met: ${fresh.map(c => c.title).join(', ')}`; setTimeout(() => $('saved').textContent = '', 3200); }
  $('score').textContent = `${done.size} of ${CHALLENGES.length}`;
  $('challenges').innerHTML = CHALLENGES.map(c => `<div class="ch${done.has(c.id) ? ' done' : ''}${c.test(A) ? ' now' : ''}${fresh.includes(c) ? ' fresh' : ''}"><span class="tick" aria-hidden="true"></span><div><b>${c.title}</b><span>${c.note}</span></div></div>`).join('');
}

// ---------- The drawing ----------
// The cross-section through a bay line, both halves, in the arch lab's look: flat stone with light seams, the roofs as
// thin outlines, the thrust in red, a green middle third under each base and a dot where the push lands. On the right,
// the heights of real vaults to measure against. With Show the storm, the wind on the left and the lee side's line.
let view = null;
function readColors() { const cs = getComputedStyle(document.documentElement); ['sky', 'panel', 'fg', 'fg-dim', 'line', 'stone', 'seam', 'ground', 'thrust', 'good', 'bad', 'bad-bg', 'warn', 'link'].forEach(n => colors[n] = cs.getPropertyValue('--' + n).trim()); }
const X = x => view.ox + x * view.sc, Y = y => view.oy - y * view.sc;
function path(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); }
const mir = (pts, s) => s < 0 ? pts : pts.map(([x, y]) => [-x, y]);
function fill(ctx, pts, col, seam = colors.seam) { path(ctx, pts); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = seam; ctx.lineWidth = 1.4 * devicePixelRatio; ctx.stroke(); }
const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function line(ctx, pts, col, w, dash) { path(ctx, pts); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = w * devicePixelRatio; ctx.setLineDash(dash ? dash.map(v => v * devicePixelRatio) : []); ctx.stroke(); ctx.setLineDash([]); }
function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x), Y(y), r * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); }
function text(ctx, t, x, y, col, align = 'left', weight = 600, size = 12) { ctx.font = `${weight} ${size * devicePixelRatio}px Barlow, "Segoe UI", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(t, X(x), Y(y)); }
const archBand = (B, cx, y0) => [...B.extrados.map(([x, y]) => [cx + x, y0 + y]), ...B.extrados.slice().reverse().map(([x, y]) => [cx - x, y0 + y]), ...B.intrados.map(([x, y]) => [cx - x, y0 + y]), ...B.intrados.slice().reverse().map(([x, y]) => [cx + x, y0 + y])];

function draw() {
  const cv = $('cv'), r = cv.getBoundingClientRect(), dpr = devicePixelRatio;
  if (!r.width) return;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const ctx = cv.getContext('2d'), { sec, o, d } = { ...A, d: A.d }, n = D.aisles, aw = o.aisleWall, H0 = sec.springing, storm = $('storm').getAttribute('aria-pressed') === 'true';
  const xb = sec.xbO(n) - 1.5, top = Math.max(sec.RIDGE + 3, 52), W = cv.width, Hc = cv.height, pad = 18 * dpr, padTop = (getComputedStyle(document.querySelector('.verdict')).position === 'static' ? 16 : 86) * dpr, padR = 92 * dpr;
  const sc = Math.min((W - pad - padR) / (-2 * xb), (Hc - pad - padTop) / (top + 1));
  view = { sc, ox: pad + (-xb) * sc + Math.max(0, (W - pad - padR - (-2 * xb) * sc) / 2), oy: Hc - pad - 1 * sc };
  ctx.clearRect(0, 0, W, Hc);
  const f = A.falls, bad = what => f && f.what === what && (f.when === 'strike' || storm);
  // ground
  ctx.fillStyle = colors.ground; path(ctx, rect(xb * 1.6, -xb * 1.6, -3, 0)); ctx.closePath(); ctx.fill();
  // the heights of real vaults
  const xr = -xb + 0.5;
  // labels that would overlap one already drawn (yours first) are left off; their lines stay
  const used = [A.crown]; line(ctx, [[xb, A.crown], [xr, A.crown]], colors.link, 1.4, [6, 4]); text(ctx, `Yours ${A.crown.toFixed(1)} m`, xr + 0.6, A.crown, colors.link, 'left', 700, 12);
  for (const [nm, h] of REFS) { line(ctx, [[xb, h], [xr, h]], colors.line, 1, [3, 5]); if (used.every(u => Math.abs(u - h) * sc > 13 * dpr)) { text(ctx, `${nm} ${h} m`, xr + 0.6, h, colors['fg-dim'], 'left', 500, 11); used.push(h); } }
  // roofs: the main roof and the aisles' lean-to roofs, as outlines
  path(ctx, [[-sec.RX, sec.RY], [0, sec.RIDGE], [sec.RX, sec.RY]]); ctx.closePath(); ctx.fillStyle = colors.line; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
  for (const s of [-1, 1]) line(ctx, mir([[sec.XO - 0.1, o.aisleRoofTop], [sec.outer(n) - aw / 2 - 0.3, o.aisleTop + 0.3]], s), colors['fg-dim'], 2.2);
  for (const s of [-1, 1]) {
    // the aisle vaults
    const r0 = sec.PIER.r, ail = (sec.XW - r0) - (n === 2 ? sec.XA1 + sec.APIER.r : sec.XA1 + aw / 2), ailX = ((sec.XW - r0) + (n === 2 ? sec.XA1 + sec.APIER.r : sec.XA1 + aw / 2)) / 2;
    fill(ctx, mir(archBand(Solver.build({ shape: 'pointed', span: ail, thick: 0.5, count: 7 }), ailX, o.aisleSpring), s), colors.stone);
    if (n === 2) { const aol = (sec.XA1 - sec.APIER.r) - (sec.XA2 + aw / 2), aolX = ((sec.XA1 - sec.APIER.r) + (sec.XA2 + aw / 2)) / 2;
      fill(ctx, mir(archBand(Solver.build({ shape: 'pointed', span: aol, thick: 0.5, count: 7 }), aolX, o.aisleSpring), s), colors.stone);
      fill(ctx, mir(rect(sec.XA1 - sec.APIER.r, sec.XA1 + sec.APIER.r, 0, o.aisleSpring), s), colors.stone); }
    // the outer wall, the buttress and its pinnacle
    fill(ctx, mir(rect(sec.outer(n) - aw / 2, sec.outer(n) + aw / 2, 0, o.aisleTop), s), colors.stone);
    const bTop = !D.tiers ? o.aisleTop : sec.upperTier(n) ? o.flyerHigh : o.flyerLow, bx = (sec.xbO(n) + sec.xbI(n)) / 2;
    fill(ctx, mir(rect(sec.xbO(n), sec.xbI(n), 0, bTop), s), bad('buttress') ? colors['bad-bg'] : colors.stone, bad('buttress') ? colors.bad : colors.seam);
    fill(ctx, mir([[bx - 0.8, bTop], [bx + 0.8, bTop], [bx + 0.8, bTop + 3.2], [bx, bTop + 10.7], [bx - 0.8, bTop + 3.2]], s), colors.stone);
    // the flyers: one flight, or two over two aisles with a pier between, and the upper tier
    if (D.tiers) {
      const yA = H0 - 1, low = o.flyerLow, xi = sec.xbI(n), flight = (x0, x1, y0, y1, dd, sag) => { const pts = [], k = 12;
        for (let j = 0; j <= k; j++) { const x = x0 + (x1 - x0) * j / k; pts.push([x, y0 + (y1 - y0) * j / k + dd / 2]); }
        for (let j = k; j >= 0; j--) { const x = x0 + (x1 - x0) * j / k; pts.push([x, y0 + (y1 - y0) * j / k - dd / 2 - sag * Math.sin(Math.PI * j / k)]); }
        fill(ctx, mir(pts, s), colors.stone); };
      if (n === 2) { const ym = yA + (low - yA) * (sec.XA1 - sec.XO) / (xi - sec.XO);
        fill(ctx, mir(rect(sec.XA1 - 0.6, sec.XA1 + 0.6, o.aisleSpring, ym), s), colors.stone);
        flight(sec.XO, sec.XA1 + 0.6, yA, ym, 0.45, 0.5); flight(sec.XA1 - 0.6, xi, ym, low, 0.45, 0.5); }
      else flight(sec.XO, xi, yA, low, 0.5, 0.7);
      if (sec.upperTier(n)) flight(sec.XO, xi, sec.yU, o.flyerHigh, 0.4, 0.55);
    }
    // the wall over the pier, to the cornice
    fill(ctx, mir(rect(sec.XO, sec.XI, 0, o.levels.cornice), s), bad('wall') ? colors['bad-bg'] : colors.stone, bad('wall') ? colors.bad : colors.seam);
  }
  // the vault, block by block
  const B = sec.ARCH, vaultCol = A.ok ? colors.stone : colors['bad-bg'], vaultSeam = A.ok ? colors.seam : colors.bad;
  B.blocks.forEach(b => { for (const s of [-1, 1]) fill(ctx, mir(b.poly.map(([x, y]) => [x, y + H0]), s), vaultCol, vaultSeam); });
  fill(ctx, B.key.full.map(([x, y]) => [x, y + H0]), vaultCol, vaultSeam);
  // a person for scale
  fill(ctx, rect(-0.25, 0.25, 0, 1.45), colors['fg-dim'], colors['fg-dim']); dot(ctx, 0, 1.65, 0.16 * sc / dpr, colors['fg-dim']);
  // the thrust: through the vault, down each wall, along the flyers and through the buttresses; the lee side in the storm
  const red = colors.thrust;
  if (A.ok) {
    const tp = Solver.thrustPoints(B, A.sec.SOL.state).map(([x, y]) => [x, y + H0]);
    line(ctx, [...tp.slice().reverse(), ...tp.slice(1).map(([x, y]) => [-x, y])], red, 3.2);
    for (const s of [-1, 1]) {
      const c = storm && s > 0 ? A.storm : A.calm, fin = l => l.filter(p => isFinite(p[0]));
      line(ctx, mir(fin(c.wall.line), s), red, 2.6);
      if (c.flyer) { line(ctx, mir([[sec.XO, c.flyer.yA], [c.flyer.xbI, c.flyer.yB]], s), red, 3);
        if (c.flyer.upper) line(ctx, mir([[sec.XO, c.flyer.upper.yA], [c.flyer.xbI, c.flyer.upper.yB]], s), red, 3);
        line(ctx, mir(fin(c.buttress.line), s), red, 2.6); }
      for (const b of [c.wall, c.buttress]) { if (!b) continue;
        // the middle third of the base, and where the push lands
        line(ctx, mir([[b.xo + b.w / 3, -0.7], [b.xo + 2 * b.w / 3, -0.7]], s), colors.good, 5);
        if (isFinite(b.x0)) { const x = Math.max(b.xo - 2.5, Math.min(b.xo + b.w + 2.5, b.x0)); dot(ctx, s < 0 ? x : -x, -0.7, 5, b.verdict === 'solid' ? red : b.verdict === 'cracks' ? colors.warn : colors.bad); } }
    }
  }
  // the storm: wind on the clerestory and roof, from the left
  if (storm) { const y0 = o.aisleRoofTop, y1 = sec.RIDGE, xw = xb - 0.5;
    // arrows from the left edge to the wall or, higher up, to the roof's slope
    for (let k = 0; k < 4; k++) { const y = y0 + (y1 - y0) * (k + 0.5) / 4, ax = Math.min(sec.XO, -sec.RX + Math.max(0, y - sec.RY) / 1.43) - 0.6; line(ctx, [[xw, y], [ax, y]], colors.link, 2.4);
      line(ctx, [[ax - 1.2, y + 0.8], [ax, y], [ax - 1.2, y - 0.8]], colors.link, 2.4); }
    text(ctx, `Wind, ${Math.round(A.F)} kN/m`, xw, y1 + 2, colors.link, 'left', 700, 12); }
}
function resize() { readColors(); if (A) draw(); }
new ResizeObserver(resize).observe($('box'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', resize);
readColors(); update();
window.designLab = { get design() { return D; }, get assessment() { return A; }, set, VERSION };
