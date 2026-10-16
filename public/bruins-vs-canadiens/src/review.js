// Review a game: every shot of a finished game, judged by the shooter's own read at the moment he let it go (the same
// values his decision and the sight lines use), with a replay of the seconds around it.
// A recorder only listens to an engine: its 'shot' event, its state after each tick, 'reset' and 'final'. It never
// changes the game. One records the Watch rink as it plays; another plays a lab game on an engine of its own, from the
// game's seed and plans, so a lab game can be reviewed without watching it. Finished games go in a short list of recent
// games; a lab game is kept as its recipe (seed, plans, settings) in this browser and played again when reopened.
// main.js installs it with the drawing functions it shares (installReview(kit)), so the replay looks like the rink.
// What if he passed: about once a second of play it keeps a snapshot of the game; for a shot, a separate engine
// (kit.makeSim) restores the last one, replays the same ticks to the instant before the release, then plays the pass he
// passed up and the shot he took, each review.whatIf.runs times with paired fresh random numbers.

export function installReview(kit) {
  const { sim, $, withCtx, drawRink, drawSkater, paintSight, S, RINK_Y, RH, RW, makeSim, VERSION } = kit;
  const { PH, clamp } = sim;
  const RV = PH.review, XC = PH.shotDecision.xgChoice, WI = RV.whatIf;
  const STEP = 1 / RV.sampleHz;
  const PERIOD = ['1st', '2nd', '3rd', 'OT'];
  const pct = v => Math.round(v * 100) + '%';
  const mmss = c => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------- Recording: the last few seconds of play, and every shot with its read ----------
  // one sample of the play on an engine (a recorded game, or the what-if engine)
  const frameOf = (E, t) => ({
    t, puck: [E.puck.x, E.puck.y], carrier: E.puck.carrier,
    sk: E.teams.flatMap(q => q.players.filter(p => !p.goalie && !p.box).map(p => [p, p.x, p.y])),
    gl: E.teams.map(q => q.goalie).filter(g => g && !g.box).map(g => [g, g.x, g.y, E.goalieLine(g)]),
  });
  // a recorder on engine E: step(dt) after every tick; at the final horn, onFinal gets the finished game
  function makeRecorder(E, onFinal) {
    const { teams, game, active, dist, oppNet, readLook } = E;
    let R;
    const fresh = () => { R = { t: 0, nextAt: 0, ring: [], moments: [], open: [], scores: [0, 0], snap: null, dts: [], snapAge: 0 }; };
    fresh();
    const frame = () => frameOf(E, R.t);
    const counts = t => { const o = teams[1 - t.id]; return { score: t.score, shots: t.shots, missed: t.missed, blocked: o.blocked + t.blockedOwn }; };
    E.on('shot', info => {
      if (game.shootout) return;
      const p = info.shooter, t = p.team, opp = active(teams[1 - t.id]), mates = active(t).filter(m => m !== p && !m.leaving);
      const read = readLook(p, t, opp, mates, Math.min(...opp.map(o => dist(o, p))));
      const now = frame(), here = q => ({ x: q.x, y: q.y, num: q.num });
      const m = { id: R.moments.length, team: t.id, period: game.period, clock: game.clock, shooter: p, why: info.why, oneTimer: info.oneTimer,
        xg: info.xg, read, net: oppNet(t), shooterAt: here(p), sightRead: read && { ...read, best: read.best && here(read.best) }, opp: opp.map(o => ({ x: o.x, y: o.y })), at: now, frames: [...R.ring.filter(f => f.t >= R.t - RV.leadSec), now], before: counts(t), outcome: null,
        replay: R.snap && info.why !== 'oneTimer' && read && read.best ? { snap: R.snap, dts: R.dts.slice() } : null };   // a one-timer is not a choice he could have passed up
      m.verdict = judge(read);
      R.moments.push(m); R.open.push(m);
    });
    // after every tick: sample the play, and settle what became of each open shot
    function step(dt) {
      R.t += dt; R.dts.push(dt); R.snapAge += dt;
      if (!R.snap || R.snapAge >= RV.snapshotEverySec) { try { R.snap = E.snapshot(); } catch (e) { R.snap = null; } R.dts = []; R.snapAge = 0; }
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
    E.on('fx', (kind, d) => {
      if (kind !== 'goal') return;
      const team = teams.findIndex(t => t.score > R.scores[t.id]); R.scores = teams.map(t => t.score); if (team < 0) return;
      for (let i = R.moments.length - 1; i >= 0; i--) { const m = R.moments[i]; if (R.t - m.at.t > 4) break; if (m.team === team && (!d.scorer || m.shooter === d.scorer)) { m.outcome = 'goal'; break; } }
    });
    E.on('reset', fresh);
    E.on('final', () => {
      R.open.forEach(m => { if (!m.outcome) m.outcome = 'loose'; }); R.open = [];
      onFinal({ moments: R.moments, teams: teams.map(t => ({ name: t.name, abbr: t.abbr })), final: teams.map(t => t.score), end: game.shootout ? 'SO' : game.overtime ? 'OT' : 'REG' });
    });
    return { step };
  }
  // a better pass: worth passMustBeatBy times his shot and at least minGapXg more; a close call: worth more, not by that much
  function judge(read) {
    if (!read) return 'none';
    if (read.best && read.bestV > read.myV * XC.passMustBeatBy && read.bestV - read.myV >= RV.minGapXg) return 'better';
    if (read.best && read.bestV > read.myV) return 'close';
    return 'right';
  }

  // ---------- Recent games: the Watch rink's finished games, and lab games played here from their recipe ----------
  // An entry: { key, label, kind ('watch' or 'lab'), final, end, recipe (lab games only), lab (the lab's own final, to
  // check against), data (the recorded game, kept for the few most recently opened) }. Lab entries are saved in this
  // browser as recipes for this sim version; a Watch game cannot be played again exactly, so it lasts until a reload.
  const H = { list: [], cur: null, busy: null, watchN: 0 };
  const KEEP = 8, KEEP_DATA = 4;   // a recording is about 10 MB, mostly the frames around each shot
  try {
    const saved = JSON.parse(localStorage.getItem('rink.reviews') || 'null');
    if (saved && saved.v === VERSION && Array.isArray(saved.list)) H.list = saved.list.filter(e => e && e.recipe && e.key && e.label).map(e => ({ ...e, data: null }));
  } catch (e) {}
  function saveH() {
    try { localStorage.setItem('rink.reviews', JSON.stringify({ v: VERSION, list: H.list.filter(e => e.recipe).map(({ data, ...e }) => e) })); } catch (e) {}
  }
  function addEntry(e) {
    H.list = [e, ...H.list.filter(x => x.key !== e.key)].slice(0, KEEP);
    trimData(); saveH();
  }
  // only a few games keep their recording: the one on screen, then Watch games (they cannot be played again), then the
  // most recently opened lab games; a lab game without one is played again when reopened
  function trimData() {
    const rec = (a, b) => (b.opened || 0) - (a.opened || 0), has = H.list.filter(e => e.data && e !== H.cur);
    const keep = new Set([H.cur, ...has.filter(e => !e.recipe).sort(rec), ...has.filter(e => e.recipe).sort(rec)].filter(Boolean).slice(0, KEEP_DATA));
    for (const e of H.list) if (!keep.has(e)) e.data = null;
    H.list = H.list.filter(e => e.data || e.recipe);
  }
  const scoreText = e => e.final ? `${e.teamsAbbr[0]} ${e.final[0]}, ${e.teamsAbbr[1]} ${e.final[1]}${e.end !== 'REG' ? ' ' + e.end : ''}` : '';
  // the Watch rink's recorder: a finished game goes on the list, and opens here unless another game is on screen
  const watchRec = makeRecorder(sim, d => {
    const lg = kit.labGame && kit.labGame();
    const e = lg ? { key: 'lab:' + JSON.stringify(lg.recipe), label: lg.label, kind: 'lab', recipe: lg.recipe, lab: lg.final }
      : { key: 'watch:' + Date.now(), label: `Watch game ${++H.watchN}`, kind: 'watch' };
    Object.assign(e, { final: d.final, end: d.end, teamsAbbr: d.teams.map(t => t.abbr), data: d, opened: Date.now() });
    addEntry(e);
    if (!kit.reviewShown() || !H.cur) openEntry(e);
    $('reviewSoon').innerHTML = d.moments.length ? `Final. <button type="button" class="linkish" id="rvGo">Review this game: all ${d.moments.length} shots</button>` : 'Final.';
    const go = $('rvGo'); if (go) go.addEventListener('click', () => { openEntry(e); kit.goReview(); });
  });
  sim.on('reset', () => { $('reviewSoon').textContent = 'After the final horn, review every shot of this game in Review a game: what the shooter saw, and whether a pass was worth more.'; });
  // a lab game played here at full speed, a few thousand ticks a frame so the page stays responsive
  let PE = null, peDone = null;
  function playRecipe(r, progress) {
    if (!PE) { PE = makeSim(); PE.rec = makeRecorder(PE, d => { if (peDone) peDone(d); }); }
    return new Promise(resolve => {
      peDone = resolve;
      Object.assign(PE.cfg, r.cfg); PE.setTactics(0, r.tacs[0]); PE.setTactics(1, r.tacs[1]); PE.newGame(r.seed);
      const run = () => {
        for (let k = 0; k < 4000 && !PE.game.over; k++) { PE.tick(0.03); PE.rec.step(0.03); }
        if (!PE.game.over) { progress(PE.game.period); requestAnimationFrame(run); }
      };
      run();
    });
  }
  async function openEntry(e) {
    if (H.busy) return;
    e.opened = Date.now();
    if (!e.data && e.recipe) {
      H.busy = e; renderPick();
      try { e.data = await playRecipe(e.recipe, p => { $('rvBusyText').textContent = `Playing ${e.label}: ${PERIOD[p - 1] || 'OT'} period`; }); }
      finally { H.busy = null; }
      e.final = e.data.final; e.end = e.data.end; e.teamsAbbr = e.data.teams.map(t => t.abbr);
    }
    H.cur = e; trimData(); saveH();
    G = e.data; renderPick(); show();
  }
  // a lab game to review: on the list (or found there) and opened
  function reviewLab(recipe, label, final) {
    const key = 'lab:' + JSON.stringify(recipe), have = H.list.find(x => x.key === key);
    const e = have || { key, label, kind: 'lab', recipe, lab: final, data: null };
    if (!have) addEntry(e); else e.label = label;
    return openEntry(e);
  }
  // the card above the review: which game this is, the recent ones, or how to get one
  function renderPick() {
    const e = H.cur, busy = H.busy;
    $('rvEmpty').hidden = !!(H.list.length || busy);
    $('rvBusy').hidden = !busy; if (busy) $('rvBusyText').textContent = `Playing ${busy.label}`;
    const check = e && e.lab ? (e.final[0] === e.lab[0] && e.final[1] === e.lab[1] ? ' <span class="lgcheck ok">Final matches the lab.</span>' : ' <span class="lgcheck bad">Final differs from the lab.</span>') : '';
    $('rvNow').hidden = !!busy || (!e && !H.list.length); $('rvPrint').hidden = !e || !!busy;
    if (!e) $('rvNow').textContent = 'Choose one of your recent games below to review it.';
    else $('rvNow').innerHTML = `<b>${esc(e.label)}</b>: ${scoreText(e)}. ${e.kind === 'lab' ? 'Played at the NHL settings with the lab plans.' : 'The game you watched.'}${check}`;
    const others = H.list;
    $('rvRecent').hidden = others.length < 2;
    $('rvRecent').innerHTML = `<span class="k">Recent games</span>` + others.map((x, i) => `<button type="button" data-entry="${i}" aria-pressed="${x === e}"${busy ? ' disabled' : ''}>${esc(x.label)}<small>${x.final ? scoreText(x) : 'not played here yet'}</small></button>`).join('');
  }
  // ---------- The game on paper: the report Print or save as PDF hands to the browser ----------
  // a still of a shot at the release, with his sight lines, drawn on the replay canvas and read back as an image
  function still(m) {
    const keep = { sel: V.sel, tau: V.tau, alt: V.alt, playing: V.playing };
    V.sel = m; V.tau = 0; V.alt = false; V.playing = false; sizeView(m); paint();
    // on white: the ice's rounded corners are transparent, which a JPEG would turn black
    const w = document.createElement('canvas'); w.width = cv.width; w.height = cv.height;
    const wc = w.getContext('2d'); wc.fillStyle = '#ffffff'; wc.fillRect(0, 0, w.width, w.height); wc.drawImage(cv, 0, 0);
    const url = w.toDataURL('image/jpeg', 0.85);
    Object.assign(V, keep); if (V.sel) sizeView(V.sel); paint();
    return url;
  }
  function report() {
    const e = H.cur; if (!e || !G || !G.moments.length) return null;
    const T = G.teams, ms = G.moments;
    const second = ms.filter(m => m.verdict === 'better' || m.outcome === 'goal').sort((a, b) => a.id - b.id);
    const shotWhat = m => m.what && !m.what.failed ? `<p><b>Played out:</b> ${esc(m.what.mean - m.what.e > 0 ? `the pass was better, about ${m.what.mean.toFixed(2)} more net chances than the shot` : m.what.mean + m.what.e < 0 ? `the shot was better, about ${(-m.what.mean).toFixed(2)} more net chances than the pass` : 'about even, the two choices are not separated')} in ${m.what.n} runs each way.</p>` : '';
    const card = m => `<figure class="pr-shot"><img src="${still(m)}" alt="${esc(`${when(m)} ${who(m.shooter)} at the release`)}"><figcaption><p class="pr-when">${when(m)} · ${T[m.team].abbr} ${esc(who(m.shooter))} · ${OUTCOME[m.outcome] || ''} · <b>${VERDICT[m.verdict]}</b></p><p>${esc(headline(m))}</p>${details(m).slice(0, 3).map(([k, v]) => `<p><b>${k}:</b> ${esc(v)}</p>`).join('')}${shotWhat(m)}</figcaption></figure>`;
    const rows = ms.map(m => `<tr><td>${when(m)}</td><td>${T[m.team].abbr}</td><td>${esc(who(m.shooter))}</td><td>${VERDICT[m.verdict]}</td><td>${OUTCOME[m.outcome] || ''}</td><td>${m.read ? pct(m.read.myV) : ''}</td><td>${m.read && m.read.best ? `${pct(m.read.bestV)} to ${esc(who(m.read.best))}` : ''}</td></tr>`).join('');
    return kit.prHead('Game review', esc(e.label), `${scoreText(e)}. ${e.kind === 'lab' ? 'Played at the NHL settings with the lab plans.' : 'A game watched on the rink.'} ${ms.length} shots, each judged by what the shooter saw when he let it go: his own look at the net against his best pass.`)
      + `<section><div class="rvteams">${$('rvTeams').innerHTML}</div></section>`
      + `<section><h2>Worth a second look <small>${second.length} shots: every better pass missed, and every goal</small></h2><p class="hint">Each picture is the play at the release. Yellow: the part of the net he could shoot at. Dark: what a defender blocked. Blue dash: his best pass, to the ringed teammate.</p>${second.length ? second.map(card).join('') : '<p>None in this game.</p>'}</section>`
      + `<section class="pr-break"><h2>Every shot</h2><table class="pr-shots"><tr><th>When</th><th>Team</th><th>Shooter</th><th>Call</th><th>Result</th><th>His shot</th><th>Best pass</th></tr>${rows}</table><p class="hint">His shot and the best pass are each one's chance of becoming a goal, from his read at the release.</p></section>`
      + `<section><h2>Every shooter</h2><div class="calib lab">${$('rvPlayers').innerHTML}</div></section>`
      + kit.prFoot();
  }
  $('rvPrint').addEventListener('click', () => { const h = report(); if (h) kit.print(h); });
  $('rvRecent').addEventListener('click', ev => { const b = ev.target.closest('[data-entry]'); if (b) openEntry(H.list[+b.dataset.entry]); });

  // ---------- What if he passed: the moment rebuilt on another engine and played out both ways ----------
  let B = null; const BR = { on: false, shots: [] };
  const find = (team, num) => num === undefined ? null : B.teams[team].all.find(q => q.num === num);
  // the instant before the release, on the what-if engine: the last snapshot, then the same ticks the game played
  function rebuild(m) {
    if (!B) { B = makeSim(); B.on('shot', i => { if (BR.on) BR.shots.push(i); }); }
    B.restore(m.replay.snap); for (const dt of m.replay.dts) B.tick(dt);
    const p = find(m.team, m.shooter.num);
    const same = p && B.puck.carrier === p && Math.abs(p.x - m.shooterAt.x) < 1e-6 && Math.abs(p.y - m.shooterAt.y) < 1e-6;
    return same ? B.snapshot() : null;
  }
  // one run from that instant: the forced choice, fresh random numbers, horizonSec of play or until a goal or whistle
  function runOne(m, pre, kind, seed, record) {
    B.restore(pre); B.reseed(seed);
    const p = find(m.team, m.shooter.num), r = find(m.team, m.read.best.num), t = B.teams[m.team], o = B.teams[1 - m.team];
    B.force(p, kind === 'pass' ? { kind: 'pass', to: r } : { kind: 'shoot' });
    const x0 = t.xg, xa0 = o.xg, g0 = t.score, ga0 = o.score, frames = record ? [] : null;
    BR.shots = []; BR.on = true; let arrived = false;
    for (let k = 1; k <= WI.horizonSec / 0.03 && !B.game.over; k++) {
      B.tick(0.03);
      if (kind === 'pass' && !arrived && k * 0.03 <= WI.arrivedWithinSec && (B.puck.carrier === r || BR.shots.some(s => s.shooter === r))) arrived = true;
      if (record && k % 3 === 0) frames.push(frameOf(B, m.at.t + k * 0.03));
      if (t.score > g0 || o.score > ga0 || B.game.faceoff) break;
    }
    BR.on = false;
    return { goal: t.score > g0, against: o.score > ga0, xg: t.xg - x0, xga: o.xg - xa0, arrived, hisShot: BR.shots.some(s => s.shooter === r), frames };
  }
  async function whatIf(m, progress) {
    const pre = rebuild(m); if (!pre) return { failed: true };
    const pass = [], shot = [];
    for (let i = 0; i < WI.runs; i++) {
      pass.push(runOne(m, pre, 'pass', 7001 + i)); shot.push(runOne(m, pre, 'shoot', 7001 + i));   // the same seed both ways: a pair
      if (i % 10 === 9) { progress((i + 1) / WI.runs); await new Promise(requestAnimationFrame); }
    }
    const net = x => x.xg - x.xga, d = pass.map((x, i) => net(x) - net(shot[i])), n = d.length, mean = d.reduce((a, b) => a + b, 0) / n;
    const e = 1.96 * Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) / Math.sqrt(n);
    const avg = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
    // one typical run of the pass to watch: the one whose net chances sit closest to the average, played again recording
    const mp = avg(pass, net); let ti = 0; pass.forEach((x, i) => { if (Math.abs(net(x) - mp) < Math.abs(net(pass[ti]) - mp)) ti = i; });
    const typical = runOne(m, pre, 'pass', 7001 + ti, true);
    return { n, mean, e, pass: { goals: pass.filter(x => x.goal).length, against: pass.filter(x => x.against).length, xg: avg(pass, x => x.xg), xga: avg(pass, x => x.xga), arrived: avg(pass, x => x.arrived ? 1 : 0), hisShot: avg(pass, x => x.hisShot ? 1 : 0) },
      shot: { goals: shot.filter(x => x.goal).length, against: shot.filter(x => x.against).length, xg: avg(shot, x => x.xg), xga: avg(shot, x => x.xga) },
      frames: [...m.frames.filter(f => f.t <= m.at.t), ...typical.frames], typicalGoal: typical.goal };
  }

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

  // ---------- The panel: the game on screen (G) ----------
  let G = null;
  const V = { kind: 'better', team: 'both', sel: null, tau: 0, playing: false, hold: 0, speed: 0.5, last: 0, alt: false, mid: false };   // mid: paused partway through a clip
  const fr = m => V.alt && m.what && m.what.frames ? m.what.frames : m.frames;   // the clip on screen: as played, or one run of the pass
  const box = $('review'), cv = $('rvCanvas'), rctx = cv.getContext('2d');
  // the replay shows only the ice the play used: the puck's path and the shooter, at least the attacking half, so the
  // sight lines and their tag stay readable on a phone
  function viewOf(m) {
    const xs = [...m.frames, ...(m.what && m.what.frames || [])].flatMap(f => [f.puck[0], ...f.sk.filter(e => e[0] === m.shooter).map(e => e[1])]);
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
  function show() {
    V.sel = null; V.playing = false; V.mid = false; V.team = 'both';
    box.hidden = !G || !G.moments.length; if (box.hidden) return;
    renderTeams(); renderLine(); renderPlayers();
    V.kind = G.moments.some(m => m.verdict === 'better') ? 'better' : 'all'; syncSeg();
    renderList(); select(list()[0] || G.moments[0]);
  }
  const list = () => G.moments.filter(m => (V.team === 'both' || m.team === +V.team) && (V.kind === 'all' || (V.kind === 'goals' ? m.outcome === 'goal' : m.verdict === V.kind)))
    .sort((a, b) => V.kind === 'better' ? (b.read.bestV - b.read.myV) - (a.read.bestV - a.read.myV) : a.id - b.id);
  function teamSum(i) {
    const ms = G.moments.filter(m => m.team === i), b = ms.filter(m => m.verdict === 'better'), judged = ms.filter(m => m.verdict !== 'none');
    return { n: ms.length, better: b.length, left: b.reduce((s, m) => s + m.read.bestV - m.read.myV, 0), right: judged.filter(m => m.verdict === 'right').length / (judged.length || 1), goals: ms.filter(m => m.outcome === 'goal').length };
  }
  function renderTeams() {
    $('rvTeams').innerHTML = G.teams.map((t, i) => { const s = teamSum(i); return `<div class="rvt ${i ? 'mtl' : 'bos'}"><b>${t.name}</b><span class="big">${s.better} <small>of ${s.n} shots had a better pass</small></span><span>About ${s.left.toFixed(1)} goals left on the table. ${pct(s.right)} of shots were the right call. ${s.goals} goal${s.goals === 1 ? '' : 's'}.</span></div>`; }).join('');
  }
  // the whole game on one strip: the Bruins' shots above the line, the Canadiens' below; tall amber marks are better passes missed
  function renderLine() {
    const periods = Math.max(3, ...G.moments.map(m => m.period)), len = p => p > 3 ? 300 : 1200, total = Array.from({ length: periods }, (_, i) => len(i + 1)).reduce((a, b) => a + b, 0);
    const x = m => { let s = 0; for (let p = 1; p < m.period; p++) s += len(p); return 100 * (s + len(m.period) - m.clock) / total; };
    let at = 0; const marks = [];
    for (let p = 1; p <= periods; p++) { marks.push(`<span class="per" style="left:${100 * at / total}%">${PERIOD[p - 1]}</span>`); at += len(p); }
    const dots = G.moments.map(m => `<button type="button" class="mk ${m.team ? 'a' : 'h'} ${m.outcome === 'goal' ? 'goal' : m.verdict}" style="left:${x(m).toFixed(2)}%" data-m="${m.id}" title="${esc(`${when(m)} ${G.teams[m.team].abbr} ${who(m.shooter)}: ${VERDICT[m.verdict]}, ${(OUTCOME[m.outcome] || '').toLowerCase()}`)}" aria-label="${esc(`${when(m)} ${who(m.shooter)}`)}"></button>`).join('');
    $('rvLine').innerHTML = `<div class="track"><span class="lbl h">${G.teams[0].abbr}</span><span class="lbl a">${G.teams[1].abbr}</span>${marks.join('')}${dots}</div>`;
  }
  function renderList() {
    const ms = list();
    $('rvList').innerHTML = ms.length ? ms.map(m => `<button type="button" class="rvrow${V.sel === m ? ' on' : ''}" data-m="${m.id}"><span class="dot ${m.team ? 'a' : 'h'}"></span><span class="when">${when(m)}</span><span class="who">${esc(who(m.shooter))}<small>${VERDICT[m.verdict]}${m.verdict === 'better' ? `, ${pct(m.read.bestV - m.read.myV)} more` : ''} · ${OUTCOME[m.outcome] || ''}</small></span></button>`).join('')
      : `<p class="hint">No shots like that${V.team === 'both' ? '' : ` for the ${G.teams[+V.team].name}`}.</p>`;
  }
  function renderPlayers() {
    const by = new Map();
    for (const m of G.moments) { const k = m.shooter; if (!by.has(k)) by.set(k, { p: k, n: 0, right: 0, close: 0, better: 0, left: 0, goals: 0 }); const r = by.get(k); r.n++; r[m.verdict] = (r[m.verdict] || 0) + 1; if (m.verdict === 'better') r.left += m.read.bestV - m.read.myV; if (m.outcome === 'goal') r.goals++; }
    const rows = [...by.values()].sort((a, b) => b.left - a.left || b.n - a.n);
    $('rvPlayers').innerHTML = `<table><tr><th>Player</th><th>Shots</th><th>Right call</th><th>Close</th><th>Better pass missed</th><th>Goals left</th><th>Goals</th></tr>${rows.map(r => `<tr><td>${r.p.team.abbr} ${esc(who(r.p))}</td><td>${r.n}</td><td>${r.right}</td><td>${r.close}</td><td>${r.better}</td><td>${r.left.toFixed(2)}</td><td>${r.goals}</td></tr>`).join('')}</table>`;
  }
  function select(m) {
    V.sel = m || null; V.playing = false; V.tau = 0; V.hold = 0; V.alt = false;
    document.querySelectorAll('#rvLine .mk.on, #rvList .rvrow.on').forEach(e => e.classList.remove('on'));
    if (!m) { $('rvText').innerHTML = ''; paint(); return; }
    document.querySelectorAll(`#rvLine .mk[data-m="${m.id}"], #rvList .rvrow[data-m="${m.id}"]`).forEach(e => e.classList.add('on'));
    const t = G.teams[m.team];
    $('rvText').innerHTML = `<p class="rvwhen"><span class="dot ${m.team ? 'a' : 'h'}"></span>${when(m)} · ${t.abbr} ${esc(who(m.shooter))} · ${OUTCOME[m.outcome] || ''}</p><p class="headline sm">${esc(headline(m))}</p><span class="pill ${m.verdict === 'better' ? 'warn' : m.verdict === 'right' ? 'good' : 'flat'}">${VERDICT[m.verdict]}</span>`
      + `<dl class="rvdl">${details(m).map(([k, v, extra]) => `<dt>${k}</dt><dd>${esc(v)}${extra ? esc(extra) : ''}</dd>`).join('')}</dl><div class="rvwhat" id="rvWhat"></div>`;
    V.mid = false; playCtl(); renderWhat(m); sizeView(m); paint();
  }
  // the what-if block: a button, its progress, then both choices played out and a verdict from the paired runs
  function renderWhat(m) {
    const el = $('rvWhat'); if (!el || V.sel !== m) return;
    syncAlt(m);
    if (!m.read || !m.read.best) { el.innerHTML = ''; return; }
    const to = who(m.read.best);
    if (!m.replay) { el.innerHTML = `<p class="hint">${m.why === 'oneTimer' ? 'A one-timer is not a choice he could have passed up, so there is nothing to play out.' : 'This shot came before the first snapshot of the game, so it cannot be rebuilt.'}</p>`; return; }
    if (m.whatRun) { el.innerHTML = `<p class="hint">Playing it out: ${Math.round(m.whatRun * 100)}%</p><div class="progress"><i style="width:${Math.round(m.whatRun * 100)}%"></i></div>`; return; }
    const w = m.what;
    if (!w) { el.innerHTML = `<h3 class="rvh">What if he passed?</h3><p class="hint">Rebuild this moment and play it out ${WI.runs} times each way: the pass to ${esc(to)}, and the shot he took, with the same fresh bounces for both, for ${WI.horizonSec} seconds or until the whistle. About a second.</p><button type="button" class="secondary" id="rvWhatGo">Play out the pass to ${esc(to)}</button>`; return; }
    if (w.failed) { el.innerHTML = '<p class="hint">This moment could not be rebuilt exactly, so it is not played out.</p>'; return; }
    const f2 = v => v.toFixed(2), net = x => x.xg - x.xga, small = Math.abs(w.mean) < RV.minGapXg;
    const verdict = w.mean - w.e > 0 ? (small ? 'Slightly better to pass, by under two hundredths of a goal: about even.' : `The pass was better: about ${f2(w.mean)} more net chances than the shot.`)
      : w.mean + w.e < 0 ? (small ? 'Slightly better to shoot, by under two hundredths of a goal: about even.' : `The shot was better: about ${f2(-w.mean)} more net chances than the pass.`)
      : 'About even: the two choices are not separated in these runs.';
    // when playing it out gives the pass much less than his read did, say why: the read prices an instant one-timer
    const gap = m.read.bestV > 0 && w.pass.xg < 0.6 * m.read.bestV ? `<p class="hint">His read priced the pass at ${pct(m.read.bestV)}, as if ${esc(to)} shot it the instant it arrived. Played out, he got a shot away in ${pct(w.pass.hisShot)} of the runs, so the pass produced less than the read promised.</p>` : '';
    const card = (cls, title, x, extra) => `<div class="c ${cls}"><b>${title}</b><span class="g">${f2(net(x))}</span><span>net chances, the next ${WI.horizonSec} seconds</span><small>${f2(x.xg)} for, ${f2(x.xga)} against. ${x.goals} goal${x.goals === 1 ? '' : 's'} in ${w.n} runs${x.against ? `, ${x.against} against` : ''}.${extra}</small></div>`;
    el.innerHTML = `<h3 class="rvh">What if he passed?</h3><p class="headline sm">${esc(verdict)}</p>
      <div class="rvcmp">${card('pass', `Pass to ${esc(to)}`, w.pass, ` The pass got there ${pct(w.pass.arrived)} of the time; he got a shot away in ${pct(w.pass.hisShot)}.`)}${card('shot', 'The shot he took', w.shot, '')}</div>${gap}
      <p class="hint">Each run starts at the instant before he shot and plays ${WI.horizonSec} seconds or until the whistle. Both choices get the same random numbers, so each pair differs only by the choice. Net chances are expected goals for minus against, and they decide it: goals are too rare to judge in ${w.n} runs. The 95% range of the difference is ${f2(w.mean - w.e)} to ${f2(w.mean + w.e)}. Choose If he passed above to watch one typical run of the pass${w.typicalGoal ? ', which scores' : ''}.</p>`;
  }
  function syncAlt(m) {
    const has = !!(m && m.what && m.what.frames);
    $('rvAlt').hidden = !has; document.querySelectorAll('#rvAlt [data-alt]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.alt === '1') === V.alt));
  }
  $('rvText').addEventListener('click', async e => {
    if (!e.target.closest('#rvWhatGo')) return;
    const m = V.sel; if (!m || m.whatRun || m.what) return;
    m.whatRun = 0.001; renderWhat(m);
    try { m.what = await whatIf(m, f => { m.whatRun = f; renderWhat(m); }); } catch (err) { m.what = { failed: true }; }
    m.whatRun = 0; m.view = null; if (V.sel === m) { sizeView(m); paint(); } renderWhat(m);
  });
  document.querySelectorAll('#rvAlt [data-alt]').forEach(b => b.addEventListener('click', () => { V.alt = b.dataset.alt === '1'; V.playing = false; V.mid = false; V.tau = 0; playCtl(); syncAlt(V.sel); paint(); }));
  const syncSeg = () => { document.querySelectorAll('#rvKind [data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === V.kind)); document.querySelectorAll('#rvTeam [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === V.team)); };
  document.querySelectorAll('#rvKind [data-k]').forEach(b => b.addEventListener('click', () => { V.kind = b.dataset.k; syncSeg(); renderList(); const l = list(); if (!l.includes(V.sel)) select(l[0]); }));
  document.querySelectorAll('#rvTeam [data-t]').forEach(b => b.addEventListener('click', () => { V.team = b.dataset.t; syncSeg(); renderList(); const l = list(); if (!l.includes(V.sel)) select(l[0]); }));
  for (const id of ['rvLine', 'rvList']) $(id).addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) select(G.moments[+b.dataset.m]); });
  const move = d => { const l = list(); if (!l.length) return; const i = l.indexOf(V.sel); select(l[(i + d + l.length) % l.length]); const row = $('rvList').querySelector('.rvrow.on'); if (row) row.scrollIntoView({ block: 'nearest' }); };
  $('rvPrev').addEventListener('click', () => move(-1)); $('rvNext').addEventListener('click', () => move(1));
  // one button plays, pauses and resumes; after a pause, Play from the start runs the lead-up again
  function playCtl() {
    $('rvPlay').textContent = V.playing ? 'Pause' : V.mid ? 'Play' : 'Play the lead-up';
    $('rvRestart').hidden = !V.playing && !V.mid;
  }
  const fromStart = () => { V.tau = -(V.sel.at.t - fr(V.sel)[0].t); V.hold = 0; V.playing = true; V.mid = false; V.last = performance.now(); playCtl(); };
  $('rvPlay').addEventListener('click', () => {
    if (!V.sel) return;
    if (V.playing) { V.playing = false; V.mid = true; playCtl(); return; }
    if (V.mid) { V.playing = true; V.mid = false; V.last = performance.now(); playCtl(); return; }
    fromStart();
  });
  $('rvRestart').addEventListener('click', () => { if (V.sel) fromStart(); });
  $('rvShot').addEventListener('click', () => { V.playing = false; V.mid = false; V.tau = 0; playCtl(); paint(); });
  document.querySelectorAll('#rvSpeed [data-s]').forEach(b => b.addEventListener('click', () => { V.speed = +b.dataset.s; document.querySelectorAll('#rvSpeed [data-s]').forEach(o => o.setAttribute('aria-pressed', o === b)); }));

  // ---------- The replay: the recorded frames, eased between samples, frozen on the release with his sight lines ----------
  function at(m, tau) {
    const T = m.at.t + tau, fs = fr(m);
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
        const mine = p.team.id === m.team;
        if (V.alt && mine && m.read && m.read.best && p.num === m.read.best.num) { rctx.lineWidth = 0.6; rctx.strokeStyle = '#3b82f6'; rctx.beginPath(); rctx.arc(x, y, 3.6, 0, Math.PI * 2); rctx.stroke(); }
        if (mine && p.num === m.shooter.num) { rctx.lineWidth = 0.6; rctx.strokeStyle = '#ffb000'; rctx.beginPath(); rctx.arc(x, y, 3.6, 0, Math.PI * 2); rctx.stroke(); }
        if (p === f.carrier) { rctx.lineWidth = 0.5; rctx.strokeStyle = '#111'; rctx.beginPath(); rctx.arc(x, y, 3.0, 0, Math.PI * 2); rctx.stroke(); }
      }
      rctx.fillStyle = '#111'; rctx.beginPath(); rctx.arc(f.puck[0], f.puck[1], 0.8, 0, Math.PI * 2); rctx.fill();
      rctx.restore();
    });
    const fs = fr(m), lead = m.at.t - fs[0].t, span = lead + (fs[fs.length - 1].t - m.at.t);
    $('rvClock').textContent = Math.abs(V.tau) < 0.05 ? 'At the release' : V.tau < 0 ? `${(-V.tau).toFixed(1)} s before the shot` : `${V.tau.toFixed(1)} s after${V.alt ? ', if he had passed' : ''}`;
    $('rvBar').style.width = (100 * clamp((V.tau + lead) / (span || 1), 0, 1)) + '%';
  }
  // playback: ice time runs at the chosen speed, holds 1.5 s on the release to show the read, then runs out the clip
  function frameLoop(now) {
    const m = V.sel;
    if (V.playing && m) {
      const dt = Math.min(0.1, (now - V.last) / 1000); V.last = now;
      const fs = fr(m), end = fs[fs.length - 1].t - m.at.t;
      if (V.hold > 0) { V.hold -= dt; if (V.hold <= 0) V.tau = 0.001; }
      else { const was = V.tau; V.tau += dt * V.speed; if (was < 0 && V.tau >= 0) { V.tau = 0; V.hold = 1.5; } }
      if (V.tau >= end) { V.tau = end; V.playing = false; V.mid = false; playCtl(); }
      paint();
    }
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);
  renderPick();
  $('reviewSoon').textContent = 'After the final horn, review every shot of this game in Review a game: what the shooter saw, and whether a pass was worth more.';

  return { step: watchRec.step, reviewLab, report, H, get G() { return G; } };
}
