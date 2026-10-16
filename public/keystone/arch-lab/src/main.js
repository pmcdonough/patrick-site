// Keystone's arch lab: one arch in section on its timber centering, its walls and, if added, flying buttresses.
// Build it, strike the centering, and the solver says whether it stands; the drawing shows the line of thrust and why.
//
// index.html loads it with a version stamp (src/main.js?v=VERSION), and its import of the solver carries the same
// stamp. node tools/bump.js keystone 0.x sets them all; tools/smoke.js checks them.
import * as Solver from '../../src/solver.js?v=0.5';

const VERSION = '0.5';
const $ = id => document.getElementById(id);
$('version').textContent = 'v' + VERSION;
const P = { shape: 'pointed', span: 12, thick: 0.8, count: 11, height: 8, width: 2.2, flyer: false, bdepth: 3.2, pinnacle: true };
const st = { placed: 0, struck: false, strikeAt: 0, drops: {}, forces: true, sel: null };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let M = null, view = null, raf = 0;
const colors = {};

const fmt = (v, d = 1) => v.toFixed(d);
const kN = v => v >= 100 ? `${Math.round(v)} kN` : `${v.toFixed(1)} kN`;
const tonnes = v => `${(v / 9.81).toFixed(v / 9.81 >= 10 ? 0 : 1)} t`;
const on = id => $(id).getAttribute('aria-pressed') === 'true';
const press = (id, v) => $(id).setAttribute('aria-pressed', String(v));

function compute() {
  const arch = Solver.build(P), sol = Solver.solve(arch), sup = Solver.supports(arch, sol.state, P);
  const tmin = Solver.minThickness(P);
  const k = arch.k, h = P.height;
  const blocks = [];
  arch.blocks.forEach((b, j) => {
    for (const side of [-1, 1]) {
      const poly = b.poly.map(([x, y]) => [x * (side < 0 ? 1 : -1), y + h]);
      blocks.push({ id: `${side < 0 ? 'L' : 'R'}${j + 1}`, side, j, step: j, poly, cx: b.cx * (side < 0 ? 1 : -1), cy: b.cy + h, A: b.A, incl: arch.joints[j].incl });
    }
  });
  const kp = arch.key.full.map(([x, y]) => [x, y + h]);
  const kc = kp.reduce((a, p) => [a[0] + p[0] / kp.length, a[1] + p[1] / kp.length], [0, 0]);
  blocks.push({ id: 'K', side: 0, j: k, step: k, poly: kp, cx: 0, cy: kc[1], A: arch.key.A * 2, incl: arch.joints[k].incl, key: true });
  // the wall alone, for when a buttress fails and takes the flyer with it
  const alone = Solver.supports(arch, sol.state, { ...P, flyer: false });
  M = { arch, sol, sup, tmin, k, h, blocks, steps: k + 1, alone };
}

// ---------- Outcome ----------
function outcome() {
  if (!st.struck) return { kind: 'centering' };
  if (st.placed < M.steps) {
    // without the keystone each half is a stack held by friction alone
    let lim = 0; while (lim < M.k && M.arch.joints[lim].incl <= Solver.FRICTION_DEG) lim++;
    return { kind: 'early', lim };
  }
  if (!M.sol.ok) return { kind: 'arch' };
  const s = M.sup;
  if (s.buttress && s.buttress.verdict === 'overturns') return { kind: 'buttress', wallToo: M.alone.wall.verdict === 'overturns' };
  if (s.wall.verdict === 'overturns') return { kind: 'wall' };
  if (s.wall.verdict === 'cracks' || (s.buttress && s.buttress.verdict === 'cracks')) return { kind: 'cracks' };
  return { kind: 'stands' };
}
const FAILS = ['early', 'arch', 'wall', 'buttress'];

function verdictText(o) {
  const s = M.sup, H = M.sol.state.H;
  switch (o.kind) {
    case 'centering': return ['', 'On centering', st.placed === 0 ? 'The timber centering is up. Place the first stones at the springing, both sides at once so the frame stays balanced.' : st.placed < M.steps ? 'The centering carries every stone until the keystone goes in. Nothing pushes on the walls yet.' : 'Keystone in. Strike the centering and the arch has to carry itself.'];
    case 'early': return ['bad', 'Fell in', `Without the keystone, nothing holds the upper stones. The lowest courses stay: their joints are flatter than ${Solver.FRICTION_DEG}°, so friction alone keeps them in place. Builders laid these without centering.`];
    case 'arch': return ['bad', 'Arch fails', `No line of thrust fits inside the stone. Where it escapes, the joints open and become hinges, and the arch folds. This shape needs stone at least ${fmt(M.tmin, 2)} m deep.`];
    case 'buttress': return ['bad', 'Buttress tips', `The flyer delivers ${kN(H)} per metre to the buttress, and it is too shallow to take it. Deepen it, or add a pinnacle and see how much that helps.`];
    case 'wall': return ['bad', 'Wall tips', `The arch pushes each wall outward with ${kN(H)} per metre. At ${fmt(P.height)} m up, that push carries the resultant past the outer face of a ${fmt(P.width)} m wall.`];
    case 'cracks': { const w = s.buttress && s.buttress.verdict === 'cracks' && s.wall.verdict !== 'cracks' ? 'buttress' : 'wall';
      return ['warn', 'Stands, joint opens', `It stands, but the resultant lands outside the middle third of the ${w}'s base, so the joint there opens on one side. A builder would make it ${w === 'wall' ? 'thicker' : 'deeper'}.`]; }
    default: return ['good', 'Stands', `The thrust line stays inside the stone everywhere. The stone is ${fmt(P.thick / M.tmin, 1)} times deeper than this shape needs, and every base presses down along its whole width.`];
  }
}

// ---------- Panel ----------
function setOut(id, v) { $('o-' + id).textContent = v; }
function syncControls() {
  $('thick').max = String(Math.min(1.6, +(0.15 * P.span).toFixed(2)));
  ['span', 'thick', 'count', 'height', 'width', 'bdepth'].forEach(id => $(id).value = P[id]);
  setOut('span', `${fmt(P.span)} m`); setOut('thick', `${fmt(P.thick, 2)} m`); setOut('count', `${P.count}`);
  setOut('height', `${fmt(P.height)} m`); setOut('width', `${fmt(P.width)} m`); setOut('bdepth', `${fmt(P.bdepth)} m`);
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shape === P.shape)));
  press('flyer', P.flyer); press('pinnacle', P.pinnacle); $('pinnacle').hidden = !P.flyer;
  $('bd-row').hidden = !P.flyer;
}
function gauge(el, title, c, show) {
  el.hidden = !show; if (!show) return;
  const pos = Math.max(-0.12, Math.min(1.12, c.e));
  const word = { solid: 'in the middle third', cracks: 'outside the middle third', overturns: 'outside the base' }[c.verdict];
  el.innerHTML = `<div class="lab"><b>${title}: where the push lands</b><span style="color:var(--${c.verdict === 'solid' ? 'good' : c.verdict === 'cracks' ? 'warn' : 'bad'})">${word}</span></div>
    <div class="track"><div class="third"></div><div class="mark" style="left:${pos * 100}%"></div></div>
    <div class="ends"><span>outer face</span><span>inner face</span></div>`;
}
function syncPanel() {
  const { sol, arch, sup, tmin } = M, H = sol.state.H;
  $('nums').innerHTML = [
    ['Weight of half the arch', `${kN(arch.Wh)}, ${tonnes(arch.Wh)}`],
    ['Outward push on each wall', sol.ok ? `${kN(H)}, ${tonnes(H)}` : 'none fits'],
    ['Thinnest stone that works', `${fmt(tmin, 2)} m`],
    ['This stone against that', `${fmt(P.thick / tmin, 2)} times`],
    ...(sup.flyer ? [['Force in each flyer', sol.ok ? kN(sup.flyer.C) : 'none']] : []),
  ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('') + '<dt class="fine">All forces per metre of vault length.</dt>';
  gauge($('g-wall'), 'Wall', sup.wall, sol.ok);
  gauge($('g-butt'), 'Buttress', sup.buttress || {}, sol.ok && !!sup.buttress);
  const [cls, label, msg] = verdictText(outcome());
  $('pill').className = `pill ${cls}`; $('pill').textContent = label; $('msg').textContent = msg;
  $('count').textContent = `${M.blocks.filter(b => b.step < st.placed).length} of ${M.blocks.length} stones`;
  $('next').disabled = st.struck || st.placed >= M.steps;
  $('all').disabled = st.struck || st.placed >= M.steps;
  $('strike').disabled = st.struck || st.placed === 0;
  syncInspect();
}
function syncInspect() {
  const s = st.sel, el = $('insp');
  if (!s) { el.textContent = 'Tap any stone, wall or buttress in the drawing.'; return; }
  if (s.type === 'block') {
    const b = M.blocks.find(x => x.id === s.id); if (!b) { st.sel = null; return syncInspect(); }
    const W = b.A * Solver.GAMMA;
    let html = `<span class="name">${b.key ? 'Keystone' : `Voussoir ${b.id}`}</span><br>${kN(W)} per metre of vault, about ${tonnes(W)}.<br>`;
    if (b.key) html += 'The last stone in. Until it is placed, each half leans on the centering. Once it is in, the two halves push against each other and the arch carries itself.';
    else {
      html += `It sits on a joint tilted ${Math.round(b.incl)}° from level. `;
      html += b.incl <= Solver.FRICTION_DEG ? 'That is flat enough for friction to hold it with no centering at all.' : `That is steeper than ${Solver.FRICTION_DEG}°, so it would slide inward without the centering until the keystone locks the arch.`;
      if (M.sol.ok) html += ` After striking, the thrust crosses that joint ${Math.round(M.sol.state.sg[b.j] * 100)}% of the way from the inner face.`;
    }
    el.innerHTML = html;
  } else {
    const c = s.type === 'wall' ? M.sup.wall : M.sup.buttress; if (!c) { st.sel = null; return syncInspect(); }
    const Wself = Solver.GAMMA * c.w * c.h;
    el.innerHTML = `<span class="name">${s.type === 'wall' ? 'Wall' : 'Buttress pier'}</span><br>${fmt(c.w)} m thick, ${fmt(c.h)} m tall, ${kN(Wself)} per metre.<br>` +
      (M.sol.ok ? `The push on its base lands ${Math.round(c.e * 100)}% of the way from the outer face to the inner face. ${c.verdict === 'solid' ? 'Inside the middle third: the whole base presses down.' : c.verdict === 'cracks' ? 'Outside the middle third: one edge of the base lifts.' : 'Outside the base entirely: it tips.'}` : 'The arch above it fails first.');
  }
}

// ---------- Drawing ----------
// Soft on purpose, like the rink in the hockey lab: flat stone with light seams between the blocks, no dimension
// lines, round line ends, and one strong color, the thrust.
function readColors() { const cs = getComputedStyle(document.documentElement); ['sky', 'panel', 'fg', 'fg-dim', 'line', 'stone', 'stone-sel', 'seam', 'ground', 'timber', 'thrust', 'good'].forEach(n => colors[n] = cs.getPropertyValue('--' + n).trim()); }
function fit(cv) {
  const s = M.sup, a = M.arch;
  let xmin = (s.buttress ? s.flyer.xbO : s.xo) - 1.2; xmin = Math.min(xmin, -a.S / 2 - 3);
  const top = P.height + a.rise + P.thick / 2 + 1.4, ymin = -0.9;
  const W = cv.width, Hc = cv.height, pad = 22 * devicePixelRatio, topPad = 64 * devicePixelRatio;
  const sc = Math.min((W - 2 * pad) / (-2 * xmin), (Hc - pad - topPad) / (top - ymin));
  view = { sc, ox: W / 2, oy: Hc - pad + ymin * sc };
}
const X = x => view.ox + x * view.sc, Y = y => view.oy - y * view.sc;
function path(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); }
function xform(pts, cx, cy, p) { if (!p) return pts; const c = Math.cos(p.rot), s = Math.sin(p.rot); return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy; return [cx + p.dx + dx * c - dy * s, cy + p.dy + dx * s + dy * c]; }); }
function rotAbout(pts, ox, oy, a) { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]); }
const easeOut = p => { const q = 1 - Math.min(1, Math.max(0, p)); return 1 - q * q * q; };
const round = ctx => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

function arrow(ctx, x0, y0, x1, y1, col) {
  const dpr = devicePixelRatio, ax = X(x0), ay = Y(y0), bx = X(x1), by = Y(y1), a = Math.atan2(by - ay, bx - ax), L = 10 * dpr;
  ctx.save(); round(ctx); ctx.strokeStyle = col; ctx.lineWidth = 3 * dpr;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - L * Math.cos(a - 0.5), by - L * Math.sin(a - 0.5)); ctx.lineTo(bx, by); ctx.lineTo(bx - L * Math.cos(a + 0.5), by - L * Math.sin(a + 0.5)); ctx.stroke();
  ctx.restore();
}
function label(ctx, txt, x, y, col, align = 'center', size = 13) {
  const dpr = devicePixelRatio;
  ctx.font = `600 ${size * dpr}px Barlow, "Segoe UI", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width, px = X(x), py = Y(y), x0 = align === 'right' ? px - w : align === 'left' ? px : px - w / 2;
  ctx.fillStyle = colors.sky; ctx.globalAlpha = 0.85; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0 - 5 * dpr, py - 9 * dpr, w + 10 * dpr, 18 * dpr, 9 * dpr); else ctx.rect(x0 - 5 * dpr, py - 9 * dpr, w + 10 * dpr, 18 * dpr);
  ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(txt, px, py);
}
function stoneFill(ctx, pts, hi) {
  path(ctx, pts); ctx.closePath(); ctx.fillStyle = hi ? colors['stone-sel'] : colors.stone; ctx.fill();
  round(ctx); ctx.strokeStyle = colors.seam; ctx.lineWidth = 1.6 * devicePixelRatio; ctx.stroke();
}
function coursedPier(ctx, x0, w, h, pose, hi) {
  // ashlar courses about 0.6 m tall with staggered joints, drawn as faint seams
  const pts = [[x0, 0], [x0 + w, 0], [x0 + w, h], [x0, h]], P2 = pose ? rotAbout(pts, pose.ox, 0, pose.a) : pts, tr = seg => pose ? rotAbout(seg, pose.ox, 0, pose.a) : seg;
  stoneFill(ctx, P2, hi);
  const n = Math.max(1, Math.round(h / 0.6)), ch = h / n;
  ctx.save(); path(ctx, P2); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = colors.seam; ctx.globalAlpha = 0.7; ctx.lineWidth = 1 * devicePixelRatio;
  for (let i = 1; i < n; i++) {
    path(ctx, tr([[x0, i * ch], [x0 + w, i * ch]])); ctx.stroke();
    for (let xx = x0 + ((i % 2) ? 0.45 : 0.9); xx < x0 + w - 0.1; xx += 0.9) { path(ctx, tr([[xx, (i - 1) * ch], [xx, i * ch]])); ctx.stroke(); }
  }
  ctx.restore();
}
function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(x), Y(y), r * devicePixelRatio, 0, Math.PI * 2); ctx.fill(); }

function render(now) {
  const cv = $('cv'), ctx = cv.getContext('2d');
  if (!view) fit(cv);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const s = M.sup, a = M.arch, h = P.height, o = outcome(), dpr = devicePixelRatio;
  const tStrike = st.struck ? (now - st.strikeAt) / 1000 : 0;
  const lower = st.struck ? easeOut(tStrike / 0.7) : 0;          // centering drop
  const tf = st.struck ? Math.max(0, tStrike - 0.75) : 0;        // time since failure began
  const failing = FAILS.includes(o.kind);
  let animating = st.struck && tStrike < 0.8;

  // ground: a soft band, no edge line
  const gx = Math.min((s.buttress ? s.flyer.xbO : s.xo) - 1.2, -a.S / 2 - 3) * 2;
  ctx.fillStyle = colors.ground; path(ctx, [[gx, 0], [-gx, 0], [-gx, -5], [gx, -5]]); ctx.closePath(); ctx.fill();

  // pier poses for tipping
  const tip = (ox, dir) => ({ ox, a: dir * Math.min(0.42, 0.5 * 1.6 * tf * tf) });
  const wallTips = failing && (o.kind === 'wall' || (o.kind === 'buttress' && o.wallToo));
  const buttTips = failing && o.kind === 'buttress';
  if ((wallTips || buttTips) && tf < 1.5) animating = true;

  for (const side of [-1, 1]) {
    const m = v => side < 0 ? v : -v;
    const wx0 = side < 0 ? s.xo : -s.xi;
    coursedPier(ctx, wx0, s.w, h, wallTips ? tip(side < 0 ? s.xo : -s.xo, side < 0 ? 1 : -1) : null, st.sel && st.sel.type === 'wall');
    if (s.buttress) {
      const f = s.flyer, bx0 = side < 0 ? f.xbO : -f.xbI;
      const bPose = buttTips ? tip(side < 0 ? f.xbO : -f.xbO, side < 0 ? 1 : -1) : null;
      coursedPier(ctx, bx0, f.wb, f.hb, bPose, st.sel && st.sel.type === 'buttress');
      if (P.pinnacle) {
        const cx = m(f.xbO + f.wb / 2), pw = f.pw, pts = [[cx - pw / 2, f.hb], [cx + pw / 2, f.hb], [cx + pw * 0.18, f.hb + f.ph * 0.82], [cx, f.hb + f.ph], [cx - pw * 0.18, f.hb + f.ph * 0.82]];
        stoneFill(ctx, bPose ? rotAbout(pts, bPose.ox, 0, bPose.a) : pts, false);
      }
      // flyer: a strut with an arched underside, dropping away if the buttress fails
      const fx0 = m(s.xo), fx1 = m(f.xbI), d = 0.55, drop = buttTips ? Math.min(f.yB, 0.5 * 9.81 * tf * tf) : 0;
      const top = [[fx0, f.yA + d / 2 - drop], [fx1, f.yB + d / 2 - drop]];
      const under = []; for (let i = 0; i <= 16; i++) { const q = i / 16, x = fx1 + (fx0 - fx1) * q, y = f.yB + (f.yA - f.yB) * q - d / 2 - 0.9 * Math.sin(Math.PI * q) * Math.min(1, f.g / 6) - drop; under.push([x, y]); }
      stoneFill(ctx, [...top, ...under], false);
    }
  }

  // centering: the timber frame, fading and dropping when struck
  if (lower < 1) {
    ctx.save(); round(ctx); ctx.globalAlpha = 1 - lower; const dy = -0.6 * lower;
    const intr = a.intrados.map(([x, y]) => [x, y + h + dy]), full = [...intr, ...intr.slice().reverse().map(([x, y]) => [-x, y])];
    const near = x => full.reduce((b, p) => Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b);
    ctx.strokeStyle = colors.timber; ctx.lineWidth = 4 * dpr; path(ctx, full); ctx.stroke();
    ctx.lineWidth = 2.2 * dpr; const xs0 = a.intrados[0][0], tie = h - 0.15 + dy;
    path(ctx, [[xs0 + 0.1, tie], [-xs0 - 0.1, tie]]); ctx.stroke();
    for (let i = 1; i < 6; i++) { const x = xs0 + (-2 * xs0) * i / 6; path(ctx, [[x, tie], near(x)]); ctx.stroke(); }
    for (const sgn of [1, -1]) { path(ctx, [[sgn * xs0 * 0.95, tie], near(sgn * xs0 * 0.5)]); ctx.stroke(); }
    for (const x of [xs0 * 0.55, -xs0 * 0.55, 0]) { path(ctx, [[x, tie], [x, 0]]); ctx.stroke(); }
    ctx.restore();
  }

  // stones
  if (failing && o.kind === 'arch' && st.forces) { // where the arch was, to read the hinges against
    ctx.save(); round(ctx); ctx.setLineDash([0.1, 5 * dpr]); ctx.strokeStyle = colors['fg-dim']; ctx.lineWidth = 2 * dpr;
    for (const b of M.blocks) { path(ctx, b.poly); ctx.closePath(); ctx.stroke(); }
    ctx.restore();
  }
  for (const b of M.blocks.filter(b => b.step < st.placed)) {
    let pts = b.poly;
    const dropT = st.drops[b.id] != null ? (now - st.drops[b.id]) / 420 : 1;
    if (dropT < 1) { animating = true; const off = (1 - easeOut(dropT)) * 2.2; pts = pts.map(([x, y]) => [x, y + off]); }
    const falls = failing && (o.kind === 'early' ? b.j >= o.lim : true);
    if (falls) {
      const rank = o.kind === 'early' ? (b.j - o.lim) : (M.k - b.j);
      const delay = o.kind === 'arch' || o.kind === 'early' ? 0.07 * (o.kind === 'early' ? (M.k - b.j) : rank) : 0.25;
      const t = Math.max(0, tf - delay), floorY = 0.35 + (b.j % 3) * 0.55 + (b.side === 0 ? 0.6 : 0);
      const dyMax = floorY - b.cy, g = 9.81;
      let dy = -0.5 * g * t * t; if (dy < dyMax) dy = dyMax; else animating = true;
      const inward = b.side === 0 ? 0 : -b.side;   // left stones drift right, toward the middle
      const spread = o.kind === 'wall' || o.kind === 'buttress' ? -inward * 0.6 : inward * 0.55;
      const dx = spread * Math.min(t, Math.sqrt(2 * Math.abs(dyMax) / g)) * (1 + (b.j % 2) * 0.4);
      const rot = (b.side === 0 ? 0.6 : -b.side * (0.5 + (b.j % 4) * 0.35)) * Math.min(1, t / 0.9);
      pts = xform(pts, b.cx, b.cy, { dx, dy, rot });
    }
    stoneFill(ctx, pts, st.sel && st.sel.id === b.id);
  }

  // forces
  if (st.forces && st.placed >= M.steps) {
    const col = colors.thrust, sol = M.sol, state = sol.ok ? sol.state : sol.best;
    const tp = Solver.thrustPoints(a, state).map(([x, y]) => [x, y + h]);
    const line = [...tp.slice().reverse(), ...tp.slice(1).map(([x, y]) => [-x, y])];
    ctx.save(); round(ctx); ctx.globalAlpha = st.struck && !failing ? 1 : (st.struck ? Math.max(0.25, 1 - tf) : 0.5);
    ctx.strokeStyle = col; ctx.lineWidth = 3.2 * dpr; if (!st.struck) ctx.setLineDash([0.1, 7 * dpr]);
    if (!(failing && o.kind !== 'arch')) { path(ctx, line); ctx.stroke(); }
    ctx.setLineDash([]);
    if (!sol.ok) // hinges where the line escapes the stone
      a.joints.forEach((J, j) => { const sg = state.sg[j]; if (sg < -0.02 || sg > 1.02) { const P0 = sg < 0 ? J.A : J.B; for (const sx of [1, -1]) dot(ctx, P0[0] * sx, P0[1] + h, 6, col); } });
    ctx.restore();
    if (sol.ok && st.struck && !failing && tStrike > 0.7) {
      const H = sol.state.H, sc = 2.6 / a.Wh;
      for (const sx of [1, -1]) {
        const x0 = s.xs * sx; arrow(ctx, x0, h, x0 - sx * H * sc, h, col);
        // the resultant down through the wall and the buttress
        ctx.save(); round(ctx); ctx.strokeStyle = col; ctx.lineWidth = 2.4 * dpr; ctx.globalAlpha = 0.75;
        path(ctx, s.wall.line.filter(p => isFinite(p[0])).map(([x, y]) => [x * sx, y])); ctx.stroke();
        if (s.buttress) { path(ctx, s.buttress.line.filter(p => isFinite(p[0])).map(([x, y]) => [x * sx, y])); ctx.stroke(); }
        ctx.restore();
        // under each base: its middle third as a green band, and a dot where the push lands
        const base = c => {
          ctx.save(); round(ctx); ctx.strokeStyle = colors.good; ctx.globalAlpha = 0.55; ctx.lineWidth = 6 * dpr;
          path(ctx, [[(c.xo + c.w / 3) * sx, -0.25], [(c.xo + 2 * c.w / 3) * sx, -0.25]]); ctx.stroke(); ctx.restore();
          dot(ctx, c.x0 * sx, 0, 5.5, col);
        };
        base(s.wall); if (s.buttress) base(s.buttress);
      }
      label(ctx, `${kN(H)} per metre`, s.xs - H * sc * 0.5, h + 1.1, col, 'right');
      if (s.flyer) label(ctx, `${kN(s.flyer.C)} per metre in each flyer`, (s.xo + s.flyer.xbI) / 2, s.flyer.yB - 2.4, col, 'center', 12);
    }
  }

  cancelAnimationFrame(raf);
  if (animating) raf = requestAnimationFrame(reduce ? t => render(t + 10000) : render);
}

function resize() {
  const cv = $('cv'), r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * devicePixelRatio); cv.height = Math.round(r.height * devicePixelRatio);
  view = null; render(performance.now());
}

// ---------- Actions ----------
function place(n) {
  const now = performance.now();
  for (let i = 0; i < n && st.placed < M.steps; i++) {
    M.blocks.filter(b => b.step === st.placed).forEach(b => st.drops[b.id] = now + i * 140);
    st.placed++;
  }
  syncPanel(); render(now);
}
function strike() { st.struck = true; st.strikeAt = performance.now(); syncPanel(); render(st.strikeAt); }
function reset() { st.placed = 0; st.struck = false; st.drops = {}; syncPanel(); render(performance.now()); }
function replay() { if (st.struck) { st.strikeAt = performance.now(); render(st.strikeAt); } }

$('next').onclick = () => place(1);
$('all').onclick = () => place(M.steps);
$('strike').onclick = strike;
$('reset').onclick = reset;
$('forces').onclick = () => { press('forces', !on('forces')); st.forces = on('forces'); render(performance.now()); };

function onParam(id, v) {
  const wasFull = st.placed >= M.steps; P[id] = v;
  if (id === 'thick' || id === 'span') P.thick = Math.min(P.thick, +(0.15 * P.span).toFixed(2));
  if (id === 'width' || id === 'thick') P.width = Math.max(P.width, P.thick);
  compute(); st.placed = wasFull ? M.steps : Math.min(st.placed, M.steps);
  if (st.struck) st.strikeAt = performance.now() - 2000;  // show the settled result while adjusting
  view = null; syncControls(); syncPanel(); render(performance.now());
}
['span', 'thick', 'count', 'height', 'width', 'bdepth'].forEach(id => {
  $(id).addEventListener('input', e => onParam(id, +e.target.value));
  $(id).addEventListener('change', replay);
});
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { onParam('shape', b.dataset.shape); replay(); });
for (const id of ['flyer', 'pinnacle']) $(id).onclick = () => { onParam(id, !P[id]); replay(); };

const TRY = {
  early: { p: { shape: 'pointed', span: 12, thick: 0.8, count: 13, height: 8, width: 2.2, flyer: false }, placed: 6 },
  thin: { p: { shape: 'round', span: 12, thick: 0.5, count: 11, height: 6, width: 2.2, flyer: false } },
  tall: { p: { shape: 'pointed', span: 12, thick: 0.8, count: 11, height: 20, width: 1.2, flyer: false } },
  fly: { p: { shape: 'pointed', span: 12, thick: 0.8, count: 11, height: 20, width: 1.2, flyer: true, bdepth: 3.8, pinnacle: true } },
  chain: { p: { shape: 'catenary', span: 12, thick: 0.3, count: 15, height: 8, width: 2.2, flyer: false } },
};
document.querySelectorAll('[data-try]').forEach(b => b.onclick = () => {
  const t = TRY[b.dataset.try]; Object.assign(P, t.p); st.sel = null;
  compute(); st.placed = t.placed || M.steps; st.drops = {}; view = null; syncControls();
  st.struck = true; st.strikeAt = performance.now(); syncPanel(); render(st.strikeAt);
  $('box').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
});

// ---------- Inspect ----------
$('cv').addEventListener('click', e => {
  const r = $('cv').getBoundingClientRect(), px = (e.clientX - r.left) * devicePixelRatio, py = (e.clientY - r.top) * devicePixelRatio;
  const wx = (px - view.ox) / view.sc, wy = (view.oy - py) / view.sc;
  const inside = pts => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > wy) !== (yj > wy) && wx < (xj - xi) * (wy - yi) / (yj - yi) + xi) c = !c; } return c; };
  let hit = null;
  if (!FAILS.includes(outcome().kind)) for (const b of M.blocks) if (b.step < st.placed && inside(b.poly)) { hit = { type: 'block', id: b.id }; break; }
  const s = M.sup, ax = Math.abs(wx);
  if (!hit && wy >= 0 && wy <= P.height && ax >= -s.xi && ax <= -s.xo) hit = { type: 'wall' };
  if (!hit && s.buttress && wy >= 0 && wy <= s.flyer.hb && ax >= -s.flyer.xbI && ax <= -s.flyer.xbO) hit = { type: 'buttress' };
  st.sel = hit; syncInspect(); render(performance.now());
});

readColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); render(performance.now()); });
new MutationObserver(() => { readColors(); render(performance.now()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
compute(); syncControls();
// open in a working state: the first courses already placed on the centering
st.placed = 3; syncPanel();
new ResizeObserver(resize).observe($('box'));
resize();
document.fonts && document.fonts.ready.then(() => render(performance.now()));
window.archLab = { P, st, get M() { return M; }, VERSION };
