// How the Game plan lab reads a run (src/lab/read.js): the baseline's headline and the order of a test's games.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const imp = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'bruins-vs-canadiens', 'src', 'lab', 'read.js')).href);

// n games from the coached team's side, chances for and against around the given means, a win in the given share of them
function games(n, xgf, xga, winShare) {
  return Array.from({ length: n }, (_, i) => {
    const wob = ((i * 7) % 5 - 2) * 0.4, f = xgf + wob, a = xga - wob;
    return { xgf: f, xga: a, xgd: f - a, pts: i < Math.round(winShare * n) ? 1 : 0 };
  });
}

test('the baseline headline leads with chances and never contradicts them', async () => {
  const { baseHeadline } = await imp();
  const even = baseHeadline('Bruins', 'Canadiens', games(50, 4.1, 4.1, 0.66));
  assert.match(even, /^The Bruins and this Canadiens plan are even on chances/);
  assert.match(even, /66% of the points on finishing and goaltending/);
  const close = baseHeadline('Bruins', 'Canadiens', games(50, 4.1, 4.1, 0.5));
  assert.match(close, /even on chances.*The points are close too/);
  const edge = baseHeadline('Bruins', 'Canadiens', games(50, 4.6, 3.6, 0.76));
  assert.match(edge, /^The Bruins outchance this Canadiens plan, 4\.6 chances a game to 3\.6, and take 76% of the points\.$/);
  const cost = baseHeadline('Bruins', 'Canadiens', games(50, 3.6, 4.6, 0.76));
  assert.match(cost, /^The Bruins are outchanced by this Canadiens plan.*but take 76% of the points, on finishing and goaltending/);
  for (const s of [even, close, edge, cost]) assert.doesNotMatch(s, /—/);
});

test("a test's games start with the ones that show its verdict", async () => {
  const { pickerOrder } = await imp();
  const items = [{ swing: 4.2 }, { swing: -5.2 }, { swing: 0.3 }];
  assert.equal(pickerOrder(items, 'bad')[0].swing, -5.2);
  assert.equal(pickerOrder(items, 'good')[0].swing, 4.2);
  assert.equal(pickerOrder(items, 'flat')[0].swing, 4.2);
});

test('a points share inside the swing from luck is called that', async () => {
  const { baseHeadline } = await imp();
  assert.match(baseHeadline('Bruins', 'Canadiens', games(50, 4.6, 3.6, 0.62)), /They take 62% of the points, within the normal swing from luck at 50 games\.$/);
});
