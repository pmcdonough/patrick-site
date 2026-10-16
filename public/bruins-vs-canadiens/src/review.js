// The shot review: after a Watch game ends, every shot of that game, judged by the shooter's own read at the moment he
// let it go (the same values his decision and the sight lines use), with a replay of the seconds around it.
// It only listens: the engine's 'shot' event, its state after each tick, 'reset' and 'final'. It never changes the game.
// main.js installs it with the drawing functions it shares (installReview(kit)), so the replay looks like the rink.

export function installReview(kit) {
  const { sim, $, withCtx, drawRink, drawSkater, paintSight, S, RINK_Y, RH, RW } = kit;
  const { teams, game, puck, PH, active, dist, oppNet, readLook, goalieLine, clamp } = sim;
  const RV = PH.review, XC = PH.shotDecision.xgChoice;
  const STEP = 1 / RV.sampleHz;
  const PERIOD = ['1st', '2nd', '3rd', 'OT'];
  const pct = v => Math.round(v * 100) + '%';
  const mmss = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------- Recording: the last few seconds of play, and every shot with its read ----------
  const R = { t: 0, nextAt: 0, ring: [], moments: [], open: [], scores: [0, 0] };
  const frame = () => ({
    t: R.t, puck: [puck.x, puck.y], carrier: puck.carrier,
    sk: teams.flatMap(t => t.players.filter(p => !p.goalie && !p.box).map(p => [p, p.x, p.y])),
    gl: teams.map(t => t.goalie).filter(g => g && !g.box).map(g => [g, g.x, g.y, goalieLine(g)]),
  });
  const counts = t => { const o = teams[1 - t.id]; return { score: t.score, shots: t.shots, missed: t.missed, blocked: o.blocked + t.blockedOwn }; };
  sim.on('shot', info => {
    if (game.shootout) return;
    const p = info.shooter, t = p.team, opp = active(teams[1 - t.id]), mates = active(t).filter(m => m !== p && !m.leaving);
    const read = readLook(p, t, opp, mates, Math.min(...opp.map(o => dist(o, p))));
    const now = frame(), here = q => ({ x: q.x, y: q.y, num: q.num });
    const m = { id: R.moments.length, team: t.id, period: game.period, clock: game.clock, shooter: p, why: info.why, oneTimer: info.oneTimer,
      xg: info.xg, read, net: oppNet(t), shooterAt: here(p), sightRead: read && { ...read, best: read.best && here(read.best) }, opp: opp.map(o => ({ x: o.x, y: o.y })), at: now, frames: [...R.ring.filter(f => f.t >= R.t - RV.leadSec), now], before: counts(t), outcome: null };
    m.verdict = judge(read);
    R.moments.push(m); R.open.push(m);
  });
  // a better pass: worth passMustBeatBy times his shot and at least minGapXg more; a close call: worth more, not by that much
  function judge(read) {
    if (!read) return 'none';
    if (read.best && read.bestV > read.myV * XC.passMustBeatBy && read.bestV - read.myV >= RV.minGapXg) return 'better';
    if (read.best && read.bestV > read.myV) return 'close';
    return 'right';
  }
  // after every tick on the Watch page: sample the play, and settle what became of each open shot
  function step(dt) {
    R.t += dt;
    if (R.t >= R.nextAt) {
      R.nextAt = R.t + STEP; const f = frame(); R.ring.push(f);
      while (R.ring.length && R.ring[0].t < R.t - RV.leadSec - STEP) R.ring.shift();
      for (const m of R.open) if (R.t - m.at.t <= RV.afterSec) m.frames.push(f);
    }
    R.open = R.open.filter(m => {
      if (!m.outcome) {
        const t = teams[m.team], c = counts(t), b = m.before;
        m.outcome = c.score > b.score ? 'goal' : c.blocked > b.blocked ? 'blocked' : c.shots > b.shots ? 'saved' : c.missed > b.missed ? 'missed' : R.t - m.at.t > 4 ? 'loose' : null;
      }
      return !m.outcome || R.t - m.at.t <= RV.afterSec;
    });
  }
  // a goal settles the scoring team's latest shot: the engine counts a shot on goal when it beats the goalie, a few
  // frames before it crosses the line, so the 'saved' read from the counts is only provisional until then
  sim.on('fx', (kind, d) => {
    if (kind !== 'goal') return;
    const team = teams.findIndex(t => t.score > R.scores[t.id]); R.scores = teams.map(t => t.score); if (team < 0) return;
    for (let i = R.moments.length - 1; i >= 0; i--) { const m = R.moments[i]; if (R.t - m.at.t > 4) break; if (m.team === team && (!d.scorer || m.shooter === d.scorer)) { m.outcome = 'goal'; break; } }
  });
  sim.on('reset', () => { R.t = 0; R.nextAt = 0; R.ring = []; R.moments = []; R.open = []; R.scores = [0, 0]; hide(); });
  sim.on('final', () => { R.open.forEach(m => { if (!m.outcome) m.outcome = 'loose'; }); R.open = []; show(); });

  // ---------- Words ----------
  const WHY = {
    read: 'He shot because his look beat every pass he had.',
    perimeter: 'He threw it at the net from the outside, hoping for a tip or a rebound.',
    chance: 'He took the shot he had instead of waiting for a better look.',
    stuck: 'He had held the puck too long with no clean option and shot through bodies.',
    breakaway: 'Breakaway: in alone on the goalie.',
    oneTimer: 'A one-timer, straight off the pass.',
  };
  const OUTCOME = { goal: 'Goal', saved: 'Saved', blocked: 'Blocked', missed: 'Missed the net', loose: 'Loose puck' };
  const VERDICT = { better: 'Better pass missed', close: 'Close call', right: 'Right call', none: 'No read' };
  const who = p => `#${p.num} ${p.name}`;
  const when = m => `${PERIOD[m.period - 1] || 'OT'} ${mmss(m.clock)}`;
  function headline(m) {
    const r = m.read; if (!r) return 'From behind the net: no look at it to judge.';
    if (m.verdict === 'better') return `A pass was worth more: ${pct(r.bestV)} to ${who(r.best)}, against ${pct(r.myV)} for his shot.`;
    if (m.verdict === 'close') return `Close call: a pass to ${who(r.best)} was worth ${pct(r.bestV)}, his shot ${pct(r.myV)}.`;
    return r.best ? `Right call: his shot, ${pct(r.myV)}, beat his best pass, ${pct(r.bestV)} to ${who(r.best)}.` : `Right call: his shot was worth ${pct(r.myV)} and he had no pass worth making.`;
  }
  function details(m) {
    const r = m.read, out = [];
    out.push(['Why he shot', WHY[m.why] || WHY.chance]);
    if (r) {
      const cut = [!r.laneOpen && 'a defender in his shooting lane', r.tight && 'a man right on him'].filter(Boolean);
      out.push(['His shot', `From where he stood the shot was worth ${pct(r.myXg)}${cut.length ? `; ${cut.join(' and ')} took it down to ${pct(r.myV)}` : ', with a clear lane'}.`]);
      if (r.best && r.bestWhy) { const b = r.bestWhy; out.push(['Best pass', `To ${who(r.best)}: his look was worth ${pct(b.xg)}${b.oneTimer ? ' as a one-timer' : ''}, the pass had a ${pct(b.arrive)} chance of getting there${b.open ? '' : ' and he was covered'}, so ${pct(r.bestV)} in all.`]); }
      else out.push(['Best pass', 'None: no teammate in the zone had a clear lane.']);
    }
    out.push(['What happened', OUTCOME[m.outcome] || 'Loose puck', m.outcome === 'goal' && m.verdict === 'better' ? ' It went in anyway; the review judges the choice, not the result.' : '']);
    return out;
  }

  // ---------- The panel ----------
  const V = { kind: 'better', team: 'both', sel: null, tau: 0, playing: false, hold: 0, speed: 0.5, last: 0 };
  const box = $('review'), cv = $('rvCanvas'), rctx = cv.getContext('2d');
  // the replay shows only the ice the play used: the puck's path and the shooter, at least the attacking half, so the
  // sight lines and their tag stay readable on a phone
  function viewOf(m) {
    const xs = m.frames.flatMap(f => [f.puck[0], ...f.sk.filter(e => e[0] === m.shooter).map(e => e[1])]);
    let x0 = Math.max(0, Math.min(...xs) - 8), x1 = Math.min(RW, Math.max(...xs) + 8);
    const atk = m.net.x > RW / 2 ? 1 : -1, need = 100 - (x1 - x0);
    if (need > 0) { if (atk > 0) { x1 = RW; x0 = Math.max(0, x1 - 100); } else { x0 = 0; x1 = Math.min(RW, 100); } }
    if (atk > 0) x1 = RW; else x0 = 0;   // the net he shot at is always in view
    return { x0, x1, k: RW / (x1 - x0) };
  }
  function sizeView(m) {
    const v = m.view || (m.view = viewOf(m));
    cv.width = Math.round(RW * S); cv.height = Math.round(RH * S * v.k);
    const ratio = (v.x1 - v.x0) / RH; cv.style.aspectRatio = `${ratio.toFixed(3)}`; cv.style.maxWidth = `min(100%, ${(70 * ratio).toFixed(1)}vh)`;   // never taller than 70% of the screen
  }
  function hide() { box.hidden = true; $('reviewSoon').hidden = false; $('reviewSoon').innerHTML = 'After the final horn, review every shot of this game: what the shooter saw, and whether a pass was worth more.'; V.sel = null; V.playing = false; }
  function show() {
    const n = R.moments.length; if (!n) return;
    $('reviewSoon').innerHTML = `Final. <button type="button" class="linkish" id="rvGo">Review all ${n} shots of this game</button>`;
    $('rvGo').addEventListener('click', () => box.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    box.hidden = false;
    renderTeams(); renderLine(); renderPlayers();
    V.kind = R.moments.some(m => m.verdict === 'better') ? 'better' : 'all'; syncSeg();
    renderList(); select(list()[0] || R.moments[0]);
  }
  const list = () => R.moments.filter(m => (V.team === 'both' || m.team === +V.team) && (V.kind === 'all' || (V.kind === 'goals' ? m.outcome === 'goal' : m.verdict === V.kind)))
    .sort((a, b) => V.kind === 'better' ? (b.read.bestV - b.read.myV) - (a.read.bestV - a.read.myV) : a.id - b.id);
  function teamSum(i) {
    const ms = R.moments.filter(m => m.team === i), b = ms.filter(m => m.verdict === 'better'), judged = ms.filter(m => m.verdict !== 'none');
    return { n: ms.length, better: b.length, left: b.reduce((s, m) => s + m.read.bestV - m.read.myV, 0), right: judged.filter(m => m.verdict === 'right').length / (judged.length || 1), goals: ms.filter(m => m.outcome === 'goal').length };
  }
  function renderTeams() {
    $('rvTeams').innerHTML = teams.map((t, i) => { const s = teamSum(i); return `<div class="rvt ${i ? 'mtl' : 'bos'}"><b>${t.name}</b><span class="big">${s.better} <small>of ${s.n} shots had a better pass</small></span><span>About ${s.left.toFixed(1)} goals left on the table. ${pct(s.right)} of shots were the right call. ${s.goals} goal${s.goals === 1 ? '' : 's'}.</span></div>`; }).join('');
  }
  // the whole game on one strip: the Bruins' shots above the line, the Canadiens' below; tall amber marks are better passes missed
  function renderLine() {
    const periods = Math.max(3, ...R.moments.map(m => m.period)), len = p => p > 3 ? 300 : 1200, total = Array.from({ length: periods }, (_, i) => len(i + 1)).reduce((a, b) => a + b, 0);
    const x = m => { let s = 0; for (let p = 1; p < m.period; p++) s += len(p); return 100 * (s + len(m.period) - m.clock) / total; };
    let at = 0; const marks = [];
    for (let p = 1; p <= periods; p++) { marks.push(`<span class="per" style="left:${100 * at / total}%">${PERIOD[p - 1]}</span>`); at += len(p); }
    const dots = R.moments.map(m => `<button type="button" class="mk ${m.team ? 'a' : 'h'} ${m.outcome === 'goal' ? 'goal' : m.verdict}" style="left:${x(m).toFixed(2)}%" data-m="${m.id}" title="${esc(`${when(m)} ${teams[m.team].abbr} ${who(m.shooter)}: ${VERDICT[m.verdict]}, ${(OUTCOME[m.outcome] || '').toLowerCase()}`)}" aria-label="${esc(`${when(m)} ${who(m.shooter)}`)}"></button>`).join('');
    $('rvLine').innerHTML = `<div class="track"><span class="lbl h">${teams[0].abbr}</span><span class="lbl a">${teams[1].abbr}</span>${marks.join('')}${dots}</div>`;
  }
  function renderList() {
    const ms = list();
    $('rvList').innerHTML = ms.length ? ms.map(m => `<button type="button" class="rvrow${V.sel === m ? ' on' : ''}" data-m="${m.id}"><span class="dot ${m.team ? 'a' : 'h'}"></span><span class="when">${when(m)}</span><span class="who">${esc(who(m.shooter))}<small>${VERDICT[m.verdict]}${m.verdict === 'better' ? `, ${pct(m.read.bestV - m.read.myV)} more` : ''} · ${OUTCOME[m.outcome] || ''}</small></span></button>`).join('')
      : `<p class="hint">No shots like that${V.team === 'both' ? '' : ` for the ${teams[+V.team].name}`}.</p>`;
  }
  function renderPlayers() {
    const by = new Map();
    for (const m of R.moments) { const k = m.shooter; if (!by.has(k)) by.set(k, { p: k, n: 0, right: 0, close: 0, better: 0, left: 0, goals: 0 }); const r = by.get(k); r.n++; r[m.verdict] = (r[m.verdict] || 0) + 1; if (m.verdict === 'better') r.left += m.read.bestV - m.read.myV; if (m.outcome === 'goal') r.goals++; }
    const rows = [...by.values()].sort((a, b) => b.left - a.left || b.n - a.n);
    $('rvPlayers').innerHTML = `<table><tr><th>Player</th><th>Shots</th><th>Right call</th><th>Close</th><th>Better pass missed</th><th>Goals left</th><th>Goals</th></tr>${rows.map(r => `<tr><td>${r.p.team.abbr} ${esc(who(r.p))}</td><td>${r.n}</td><td>${r.right}</td><td>${r.close}</td><td>${r.better}</td><td>${r.left.toFixed(2)}</td><td>${r.goals}</td></tr>`).join('')}</table>`;
  }
  function select(m) {
    V.sel = m || null; V.playing = false; V.tau = 0; V.hold = 0;
    document.querySelectorAll('#rvLine .mk.on, #rvList .rvrow.on').forEach(e => e.classList.remove('on'));
    if (!m) { $('rvText').innerHTML = ''; paint(); return; }
    document.querySelectorAll(`#rvLine .mk[data-m="${m.id}"], #rvList .rvrow[data-m="${m.id}"]`).forEach(e => e.classList.add('on'));
    const t = teams[m.team];
    $('rvText').innerHTML = `<p class="rvwhen"><span class="dot ${m.team ? 'a' : 'h'}"></span>${when(m)} · ${t.abbr} ${esc(who(m.shooter))} · ${OUTCOME[m.outcome] || ''}</p><p class="headline sm">${esc(headline(m))}</p><span class="pill ${m.verdict === 'better' ? 'warn' : m.verdict === 'right' ? 'good' : 'flat'}">${VERDICT[m.verdict]}</span>`
      + `<dl class="rvdl">${details(m).map(([k, v, extra]) => `<dt>${k}</dt><dd>${esc(v)}${extra ? esc(extra) : ''}</dd>`).join('')}</dl>`;
    $('rvPlay').textContent = 'Play the lead-up'; sizeView(m); paint();
  }
  const syncSeg = () => { document.querySelectorAll('#rvKind [data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === V.kind)); document.querySelectorAll('#rvTeam [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === V.team)); };
  document.querySelectorAll('#rvKind [data-k]').forEach(b => b.addEventListener('click', () => { V.kind = b.dataset.k; syncSeg(); renderList(); const l = list(); if (!l.includes(V.sel)) select(l[0]); }));
  document.querySelectorAll('#rvTeam [data-t]').forEach(b => b.addEventListener('click', () => { V.team = b.dataset.t; syncSeg(); renderList(); const l = list(); if (!l.includes(V.sel)) select(l[0]); }));
  for (const id of ['rvLine', 'rvList']) $(id).addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) select(R.moments[+b.dataset.m]); });
  const move = d => { const l = list(); if (!l.length) return; const i = l.indexOf(V.sel); select(l[(i + d + l.length) % l.length]); const row = $('rvList').querySelector('.rvrow.on'); if (row) row.scrollIntoView({ block: 'nearest' }); };
  $('rvPrev').addEventListener('click', () => move(-1)); $('rvNext').addEventListener('click', () => move(1));
  $('rvPlay').addEventListener('click', () => {
    if (!V.sel) return;
    if (V.playing) { V.playing = false; $('rvPlay').textContent = 'Play the lead-up'; return; }
    V.tau = -(V.sel.at.t - V.sel.frames[0].t); V.hold = 0; V.playing = true; V.last = performance.now(); $('rvPlay').textContent = 'Pause';
  });
  $('rvShot').addEventListener('click', () => { V.playing = false; V.tau = 0; $('rvPlay').textContent = 'Play the lead-up'; paint(); });
  document.querySelectorAll('#rvSpeed [data-s]').forEach(b => b.addEventListener('click', () => { V.speed = +b.dataset.s; document.querySelectorAll('#rvSpeed [data-s]').forEach(o => o.setAttribute('aria-pressed', o === b)); }));

  // ---------- The replay: the recorded frames, eased between samples, frozen on the release with his sight lines ----------
  function at(m, tau) {
    const T = m.at.t + tau, fs = m.frames;
    let i = fs.findIndex(f => f.t >= T); if (i < 0) return fs[fs.length - 1]; if (i === 0) return fs[0];
    const a = fs[i - 1], b = fs[i], k = clamp((T - a.t) / ((b.t - a.t) || 1), 0, 1), mix = (u, v) => u + (v - u) * k;
    const pos = new Map(b.sk.map(e => [e[0], e]));
    return { t: T, puck: [mix(a.puck[0], b.puck[0]), mix(a.puck[1], b.puck[1])], carrier: k < 0.5 ? a.carrier : b.carrier,
      sk: a.sk.filter(e => pos.has(e[0])).map(e => { const q = pos.get(e[0]); return [e[0], mix(e[1], q[1]), mix(e[2], q[2])]; }),
      gl: a.gl.map((e, j) => { const q = b.gl[j]; return q && q[0] === e[0] ? [e[0], mix(e[1], q[1]), mix(e[2], q[2]), e[3].map((v, n) => mix(v, q[3][n]))] : e; }) };
  }
  function paint() {
    const m = V.sel; rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.clearRect(0, 0, cv.width, cv.height);
    if (!m) return;
    const f = V.tau === 0 ? m.at : at(m, V.tau);
    const v = m.view;
    rctx.setTransform(v.k, 0, 0, v.k, -v.x0 * S * v.k, 0);
    withCtx(rctx, () => {
      rctx.save(); rctx.translate(0, -RINK_Y * S); drawRink(); rctx.restore();
      rctx.save(); rctx.scale(S, S);
      if (Math.abs(V.tau) < 1e-6 && m.read) paintSight(m.shooterAt, m.net, m.opp, m.sightRead, VERDICT[m.verdict], m.verdict === 'better', m.verdict !== 'better');
      for (const [g, , , seg] of f.gl) { rctx.lineCap = 'round'; rctx.lineWidth = 1.5; rctx.strokeStyle = g.team.col; rctx.beginPath(); rctx.moveTo(seg[0], seg[1]); rctx.lineTo(seg[2], seg[3]); rctx.stroke(); rctx.lineWidth = 0.5; rctx.strokeStyle = g.team.col2; rctx.stroke(); }
      for (const [g, x, y] of f.gl) drawSkater(g, x, y, 1.5, false);
      for (const [p, x, y] of f.sk) {
        const d = Math.hypot(f.puck[0] - x, f.puck[1] - y);
        if (d < 16 && d > 0.1) { const a = Math.atan2(f.puck[1] - y, f.puck[0] - x), len = Math.min(3.6, d); rctx.lineWidth = 0.4; rctx.strokeStyle = 'rgba(0,0,0,0.55)'; rctx.beginPath(); rctx.moveTo(x, y); rctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); rctx.stroke(); }
        drawSkater(p, x, y, 2.0, false);
        if (p === m.shooter) { rctx.lineWidth = 0.6; rctx.strokeStyle = '#ffb000'; rctx.beginPath(); rctx.arc(x, y, 3.6, 0, Math.PI * 2); rctx.stroke(); }
        if (p === f.carrier) { rctx.lineWidth = 0.5; rctx.strokeStyle = '#111'; rctx.beginPath(); rctx.arc(x, y, 3.0, 0, Math.PI * 2); rctx.stroke(); }
      }
      rctx.fillStyle = '#111'; rctx.beginPath(); rctx.arc(f.puck[0], f.puck[1], 0.8, 0, Math.PI * 2); rctx.fill();
      rctx.restore();
    });
    const lead = m.at.t - m.frames[0].t, span = lead + (m.frames[m.frames.length - 1].t - m.at.t);
    $('rvClock').textContent = Math.abs(V.tau) < 0.05 ? 'At the release' : V.tau < 0 ? `${(-V.tau).toFixed(1)} s before the shot` : `${V.tau.toFixed(1)} s after`;
    $('rvBar').style.width = (100 * clamp((V.tau + lead) / (span || 1), 0, 1)) + '%';
  }
  // playback: ice time runs at the chosen speed, holds 1.5 s on the release to show the read, then runs out the clip
  function frameLoop(now) {
    const m = V.sel;
    if (V.playing && m) {
      const dt = Math.min(0.1, (now - V.last) / 1000); V.last = now;
      const end = m.frames[m.frames.length - 1].t - m.at.t;
      if (V.hold > 0) { V.hold -= dt; if (V.hold <= 0) V.tau = 0.001; }
      else { const was = V.tau; V.tau += dt * V.speed; if (was < 0 && V.tau >= 0) { V.tau = 0; V.hold = 1.5; } }
      if (V.tau >= end) { V.tau = end; V.playing = false; $('rvPlay').textContent = 'Play the lead-up'; }
      paint();
    }
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);
  hide();

  return { step, R };
}
