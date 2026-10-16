// How the Game plan lab reads a run: the averages and 95% ranges, the verdicts and the baseline's headline.
// Plain functions with no page in them, so the unit tests can check the sentences.
export const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
export const ci95 = a => a.length > 1 ? 1.96 * Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)) / Math.sqrt(a.length) : 0;
export const verdict = (m, e) => m - e > 0 ? ['good', 'Clear edge'] : m + e < 0 ? ['bad', 'Clear cost'] : ['flat', 'Too close to call'];
const pct = v => Math.round(100 * v) + '%';

// The baseline in one or two sentences, chances first: they are the number to trust. Each game is { xgd, xgf, xga, pts }
// from the coached team's side (pts: 1 a win, 0.5 an overtime loss). Chances and points are each judged by their 95% range,
// chances against even and points against half of them, so the sentence never says more than the games show.
export function baseHeadline(me, op, games) {
  const f = mean(games.map(g => g.xgf)).toFixed(1), a = mean(games.map(g => g.xga)).toFixed(1), n = games.length;
  const vx = verdict(mean(games.map(g => g.xgd)), ci95(games.map(g => g.xgd)))[0];
  const pts = games.map(g => g.pts), p = pct(mean(pts)), vp = verdict(mean(pts) - 0.5, ci95(pts))[0];
  if (vx === 'flat') {
    const lead = f === a ? `The ${me} and this ${op} plan are even on chances, ${f} a game each.` : `The ${me} and this ${op} plan are even on chances, ${f} a game for and ${a} against.`;
    return lead + (vp === 'good' ? ` The ${me} take ${p} of the points on finishing and goaltending.`
      : vp === 'bad' ? ` The ${me} take only ${p} of the points, on finishing and goaltending.`
      : ` The points are close too: the ${me} take ${p}.`);
  }
  const lead = vx === 'good' ? `The ${me} outchance this ${op} plan, ${f} chances a game to ${a}` : `The ${me} are outchanced by this ${op} plan, ${f} chances a game to ${a}`;
  return vp === vx ? `${lead}, and take ${p} of the points.`
    : vp === 'flat' ? `${lead}. They take ${p} of the points, within the normal swing from luck at ${n} games.`
    : `${lead}, but take ${p} of the points, on finishing and goaltending.`;
}

// A test's games in the order that shows its verdict: a clear cost the worst swings first, a clear edge or a close call
// the best first. Each item has a swing in net chances for the coached team.
export const pickerOrder = (items, cls) => [...items].sort((x, y) => cls === 'bad' ? x.swing - y.swing : y.swing - x.swing);
export const pickerLabel = (me, cls) => cls === 'bad' ? `Open a game, the ones where the change hurt the ${me} most first` : cls === 'good' ? `Open a game, the ones where the change helped the ${me} most first` : `Open a game, the biggest swings for the ${me} first`;
