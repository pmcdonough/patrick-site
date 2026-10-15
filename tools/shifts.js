// Shift-length distribution over three seeded games at the build defaults, and which situations line changes start in.
// Expect a mean near 45-50 s, p90 near 70-75 s, and no change windows in our own zone (no "-own" keys).
const { load } = require('./engine');
(async () => {
  const E = await load(), sim = E.create();
  const ends = [], windows = {};
  const zone = (t, x) => { const f = sim.toFx(t, x); return f < 64 ? 'own' : f > 114 ? 'off' : 'neutral'; };
  for (let s = 1; s <= 3; s++) {
    const prev = new Map(), leaving = new Set();
    E.play(sim, s, r => {
      for (const t of r.teams) for (const q of t.all) {
        if (q.goalie) continue;
        const was = prev.get(q) || 0;
        if (q.onIce) { prev.set(q, q.shift); if (q.leaving && !leaving.has(q)) { leaving.add(q); const c = r.puck.carrier; const k = c ? (c.team === t ? 'ours-' : 'theirs-') + zone(t, c.x) : 'loose-' + zone(t, r.puck.x); windows[k] = (windows[k] || 0) + 1; } if (!q.leaving) leaving.delete(q); }
        else if (was > 0) { ends.push(was); prev.set(q, 0); leaving.delete(q); }
      }
    });
  }
  ends.sort((a, b) => a - b); const pct = f => Math.round(ends[Math.floor(ends.length * f)]);
  const buckets = {}; for (const e of ends) { const k = e < 30 ? '<30' : e < 45 ? '30-45' : e < 60 ? '45-60' : e < 75 ? '60-75' : e < 90 ? '75-90' : '90+'; buckets[k] = (buckets[k] || 0) + 1; }
  console.log({ shifts: ends.length, meanSec: Math.round(ends.reduce((a, b) => a + b, 0) / ends.length), p50: pct(.5), p90: pct(.9), maxSec: Math.round(ends[ends.length - 1]), buckets, changeWindows: windows });
})();
