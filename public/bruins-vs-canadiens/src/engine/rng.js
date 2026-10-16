// The seeded generator for a game (mulberry32 on seed * 2654435761). sim.newGame(seed) plays the game for that seed;
// a game started without one uses Math.random. tools/engine.js and the strategy test use the same seeds, so a seed
// names the same game everywhere.
// Its state is one integer (gen.state), so a snapshot of a game can carry it and a restored game draws the same numbers.
export function seeded(seed) {
  let a = seed * 2654435761;
  const gen = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  Object.defineProperty(gen, 'state', { get: () => a, set: v => { a = v; } });
  return gen;
}
