// Your own cathedral: a design from the design page (design.js), built on the kit by the Gothic builder (gothic.js) the
// way Amiens is, with a west front, an east end and, if it fails, the collapse. make(design) returns what every building
// module exports (pieces, steps, KIT, forceLines and the rest); the 3D page calls it with the design in its address.
// Units: metres, kN. x across (left negative), y up, z along the church: the west front at +z. Nothing here touches the page.
import { createKit } from './kit.js?v=0.11';
import { frame, aisled, front, crossing, apse, SIDES } from './gothic.js?v=0.11';
import { assess, query, advise, lands, layoutOf, apseSides } from './design.js?v=0.11';

const m = (v, d = 1) => `${(+v).toFixed(d).replace(/\.0$/, '')} m`;
const kNm = v => `${Math.round(v)} kN`;

export function make(design) {
  const a = assess(design), d = a.d, { sec, L } = a, n = d.aisles, H0 = sec.springing, LV = sec.levels;
  const name = d.name || 'Your cathedral';
  const K = createKit();
  const { pieces, steps } = K;
  let BAG = 0; const bag = nm => K.bag(++BAG, nm);

  // ---------- The plan ----------
  // one stretch, the nave, or four round a crossing (layoutOf in design.js); each end of the church is a flat wall or,
  // at the east, an apse, which needs a buttress, not a corner pier, on the line it starts from
  const lay = layoutOf(d, sec, L), apsed = d.east === 1, NAMES = { nave: 'Nave', choir: 'Choir', armN: 'North transept', armS: 'South transept' };
  const runs = lay.runs.map(R => ({ T: R.T, key: R.key, name: NAMES[R.key], F: frame(0, 0, R.u, R.v), lines: R.lines,
    sideName: R.key.startsWith('arm') ? (s => s < 0 ? 'east' : 'west') : (s => s < 0 ? 'north' : 'south') }));
  const RUN = Object.fromEntries(runs.map(r => [r.key, r])), nave = RUN.nave, nb = d.bays;
  const pidOf = (T, k, s, i, c) => `${T}${k}-${s < 0 ? 'A' : 'B'}${i}${c != null ? '-' + c : ''}`;
  const chapelBays = (r, from) => new Set(d.chapels ? r.lines.slice(from, -2).map((_, b) => b + from) : []);
  if (!d.transept) nave.sides = Object.fromEntries(SIDES.map(s => [s, { aisles: n, line: i => i === nb ? 'corner' : i === 0 ? (apsed ? 'buttress' : 'corner') : 'buttress', chapels: chapelBays(nave, 1) }]));
  else {
    // the nave and the choir start with the transept's aisle (no outer wall, no aisle arch at the crossing), with a corner
    // pier where the transept's outer wall meets theirs; the arms lean on those corner piers and share the crossing piers
    for (const r of [RUN.nave, RUN.choir]) { const last = r.lines.length - 1;
      r.sides = Object.fromEntries(SIDES.map(s => [s, { aisles: 1, open: new Set([0]), noAisleArch: new Set([0]), chapels: chapelBays(r, 2),
        line: i => i === 0 ? 'none' : i === 1 ? 'corner' : i === last ? (r.key === 'choir' && apsed ? 'buttress' : 'corner') : 'buttress' }])); }
    for (const arm of [RUN.armN, RUN.armS]) { const ns = arm.key === 'armN' ? -1 : 1, last = arm.lines.length - 1;
      arm.sides = Object.fromEntries(SIDES.map(s => { const other = s > 0 ? RUN.nave : RUN.choir;
        return [s, { aisles: 1, open: new Set([0]), noAisleArch: new Set([0]),
          line: i => i === 0 ? 'none' : i === 1 ? { sup: [[pidOf(other.T, 'K', ns, 1), 1]] } : i === last ? 'corner' : 'buttress',
          mainLink: i => i === 0 ? (k, c) => pidOf(other.T, k, ns, 0, c) : null }]; })); }
  }
  const X = d.transept ? crossing(K, sec, { nave: RUN.nave, choir: RUN.choir, armN: RUN.armN, armS: RUN.armS }) : null;
  const eastRun = d.transept ? RUN.choir : nave, eastI = d.transept ? eastRun.lines.length - 1 : 0, eastOut = d.transept ? 1 : -1;
  const westI = nave.lines.length - 1, naveLen = nave.lines.at(-1) - nave.lines[0];
  const C = a.calm, S = a.storm, tier = ['no flyers', 'one tier of flyers', 'two tiers of flyers'][d.tiers];
  // what the strike does, in words: the vault, then the walls and buttresses
  const strikeNote = () => {
    const head = `The moment of truth, ${m(a.crown)} up: the centering comes out and the vault has to carry itself.`;
    if (!a.ok) return `${head} But no line of thrust fits inside a vault ${m(d.thick, 2)} deep: this shape needs at least ${m(a.tmin, 2)}. The joints where the thrust escapes open into hinges.`;
    const push = ` It pushes out on each wall with about ${kNm(a.H)} for every metre of the nave.`;
    if (!d.tiers) return `${head}${push} With no flyers, the walls take it alone: at the wall's base the push lands ${lands(C.wall)}. The red line is the path.`;
    return `${head}${push} The flyers carry it to buttresses ${m(d.bdepth)} deep. At the buttress's base the push lands ${lands(C.buttress)}; at the wall's, ${lands(C.wall)}. The red line is the path.`;
  };
  const W = {
    footings: ['Footings', d.transept ? `Footings for the piers, the aisle walls and the buttresses of the nave, the transept and the choir, all at once. The nave is ${m(naveLen, 0)} long, the transept ${m(2 * RUN.armN.lines.at(-1), 0)} from end to end, ${m(d.span)} wide between the walls.`
      : `Footings for ${2 * (nb + 1)} piers, the aisle walls and the buttresses. The nave is ${m(naveLen, 0)} long in ${nb} bays of ${m(L)}, ${m(d.span)} wide between the walls.`],
    piers: ['Piers', `Round piers in drums, ${m(2 * sec.PIER.r)} across and ${m(LV.arcade)} tall to the top of their capitals.`],
    arcadeCentering: ['Centering for the arcades', 'Timber frames under every arch of the arcade.'],
    arcades: ['Arcades', 'Nine stones to each arch, laid from both piers at once and closed with a keystone.'],
    arcadeStrike: ['Strike the arcade centering', 'The arches carry themselves.'],
    aisleWalls: ['Aisle walls and buttresses', `The outer walls of the ${n === 2 ? 'two aisles on each side' : 'aisles'} go up with a window in every bay, and the buttresses start up beside them.`],
    aisleVaults: ['Aisle vaults', `Arches across the aisles at every bay line, and vaults between them, about ${m(sec.aisleTop, 0)} up.`],
    upperWalls: ['Triforium and clerestory', `Above the arcade, the triforium, then the clerestory windows, up to the springing of the vault at ${m(H0)} and on to the cornice.`],
    buttresses: ['Buttresses rise', `The buttresses go up to ${m(d.tiers === 2 ? sec.flyerHigh : sec.flyerLow, 0)}, ready for ${tier}.`],
    flyerCentering: ['Centering for the flyers', 'A long timber frame under every flyer.'],
    flyers: ['Flying buttresses', d.tiers === 2 ? 'Two tiers at every buttress: the lower flyers meet the wall where the vault pushes, the upper ones higher up, where the wind on the roof pushes.' : n === 2 ? 'Each flyer crosses both aisles in two flights, with a pier half way.' : 'One flyer at every buttress, meeting the wall where the vault pushes.'],
    flyerStrike: ['Strike the flyer centering', 'The flyers stand on their own.'],
    pinnacles: ['Pinnacles', d.tiers ? 'A pinnacle on every buttress. Its weight helps the buttress keep the flyer\'s push inside its base.' : 'A pinnacle on every buttress of the aisle walls.'],
    vaultCentering: ['Centering for the vault', `Timber frames under every rib, ${m(H0, 0)} above the floor.`],
    ribs: ['Ribs', `Transverse ribs across the nave at every bay line, two diagonals in every bay meeting at a boss, and a wall rib along each side: a ${d.shape} vault ${m(d.thick, 2)} deep.`],
    webbing: ['Webbing', 'Thin courses of light stone close the four cells of every bay.'],
    vaultStrike: ['Strike the centering', strikeNote()],
    roofs: ['Roof', `The oak frame and the lead roof, its ridge ${m(sec.RIDGE, 0)} up, and lean-to roofs over the aisles.`],
    bag: key => { const b = { footings: 'Foundations', aisleWalls: 'Aisles', upperWalls: 'Upper walls', [d.tiers ? 'buttresses' : 'pinnacles']: 'Buttresses', vaultCentering: 'The vault', roofs: 'Roof' }[key]; if (b) bag(b); },
  };
  const strikeFails = a.falls && a.falls.when === 'strike';
  let STEP_FALL = null;
  if (strikeFails) { W.afterStrike = () => { bag('It falls'); STEP_FALL = K.step('It falls', fallNote()); }; W.noRoofs = true; }
  if (X) W.after = key => ({ vaultCentering: X.centering, ribs: X.ribs, webbing: X.webs, roofs: X.roof })[key]?.();
  if (X) { W.vaultCentering[1] += ' Over the crossing, two more under the diagonals.'; W.ribs[1] += ' The crossing gets its own diagonals and boss, between the first arches of the four arms.'; }
  const NAVE = aisled(K, sec, runs, W);

  // ---------- The ends, the chapels, the glass ----------
  let WEST = null, EAST = null, APSE = null, SPIRE = 0, STEP_FRONT = null, STEP_EAST = null; const TENDS = [];
  if (!strikeFails) {
    bag('West front'); STEP_FRONT = steps.length;
    WEST = front(K, sec, nave, { i: westI, out: 1, west: true, towers: d.towers > 0, spires: d.towers === 2, id: 'WF', text: {
      lower: ['West front: the portals', `The front closes the west end, 2 m thick: a portal into the nave${n ? ' and one into each aisle' : ''}.`],
      rose: ['West front: the rose', 'A round window as wide as the nave can take, with stone tracery.'],
      gable: ['West front: the gable', 'The front rises to a gable in front of the roof.'],
      towers: ['Towers', 'Two towers on the ends of the aisles, with an open belfry at the top.'],
      spires: ['Spires', 'A stone spire on each tower, octagonal, hollow and light.'] } });
    if (d.transept) { bag('Transept ends');
      for (const arm of [RUN.armN, RUN.armS]) TENDS.push(front(K, sec, arm, { i: arm.lines.length - 1, out: 1, west: true, id: arm.T + 'E', text: {
        lower: [`${arm.name}: the portal`, `The ${arm.name.toLowerCase()} ends in a wall with a portal of its own.`],
        rose: [`${arm.name}: the rose`, 'A rose as wide as the arm can take.'],
        gable: [`${arm.name}: the gable`, 'The gable in front of the roof.'] } })); }
    if (apsed) { bag('Apse'); STEP_EAST = steps.length;
      APSE = apse(K, sec, eastRun, { i: eastI, out: eastOut, nap: apseSides(d), chapels: d.chapels, id: 'AP', text: {
        footings: ['Apse: footings', `The church ends in a half-circle of ${apseSides(d)} sides: footings for its piers, its outer wall and its buttresses.`],
        piers: ['Apse: piers and outer wall', `Slimmer piers set close on the half-circle${n === 2 ? ', a second ring for the ambulatory' : ''}, and the outer wall with a window in every side.`],
        arches: ['Apse: arches', 'Narrow, steep arches between the apse piers, on centering, and arches across the ambulatory, the aisle that turns round the apse.'],
        ambulatory: ['Apse: the ambulatory', `The centering comes out, and wedge-shaped vaults close the ambulatory${d.chapels ? '. Beyond it, a chapel between every pair of buttresses' : ''}.`],
        walls: ['Apse: walls', 'The apse walls rise on the arches: a triforium and a tall window in every side.'],
        buttresses: ['Apse: buttresses', 'A buttress on every line between the sides, with its pinnacle.'],
        flyers: ['Apse: flying buttresses', 'The flyers spread out round the apse like the spokes of a wheel.'],
        centering: ['Apse: centering for the vault', 'A half-frame under each rib, from the wall to the middle.'],
        vault: ['Apse: ribs and webbing', 'Half-ribs climb from the wall to the keystone of the last arch across the choir, and thin webs close the wedges between them.'],
        strike: ['Apse: strike the centering', 'The apse vault carries itself; its push goes out along every spoke.'],
        roofs: ['Apse: roofs', 'A half-cone of lead over the apse, and a lean-to round the ambulatory.'] } }); }
    else { bag('East end'); STEP_EAST = steps.length;
    EAST = front(K, sec, eastRun, { i: eastI, out: eastOut, west: false, id: 'EE', text: {
      lower: ['East end: three lancets', 'A flat east end, the way many English and some French churches finish: three tall windows over the altar.'],
      rose: ['East end: the rose', 'A rose above the lancets.'],
      gable: ['East end: the gable', 'The gable in front of the roof.'] } }); }
    if (d.spire) { bag('Spire'); K.step('The spire over the crossing', 'A spire of oak covered with lead rises from the crossing, as tall again as the ridge, on the four crossing piers.'); SPIRE = X.spire(); }
    if (d.chapels) { bag('Chapels'); K.step('Chapels between the buttresses', 'Chapels fill the spaces between the buttresses, each with a window and a gable.'); NAVE.chapels(); }
    bag('Finishing');
    K.step('Glazing', `Glass in every window: the aisles, the clerestory, the roses${apsed ? ' and the apse' : ' and the east lancets'}.`); NAVE.glaze(); WEST.glaze(); EAST?.glaze(); APSE?.glaze(); TENDS.forEach(t => t.glaze());
    K.step('Paving', 'The floor is paved.'); NAVE.pave(); APSE?.pave();
    bag('The storm');
    STEP_FALL = a.falls ? K.step('The storm: it falls', fallNote()) : K.step('The storm', stormNote());
  }

  // ---------- In words ----------
  function fallNote() {
    const f = a.falls;
    const why = f.what === 'vault' ? 'The vault folds at its hinges and falls into the nave. The walls stand.'
      : `At the ${f.what}'s base the push lands outside the base: it tips${f.what === 'buttress' ? ', the flyers lose their footing, the walls lean out' : ' outward'}, and the vault comes down${f.when === 'storm' ? ' on the lee side, with the roof' : ''}.`;
    const head = f.when === 'storm' ? `A winter gale, gusts of 40 m/s (145 km/h), pushes on the roof and the clerestory with about ${kNm(a.F)} for every metre of the nave. ` : '';
    return `${head}${why} ${advise(a)} The fall is drawn, not computed: the solver says that it falls, not how.`;
  }
  function stormNote() {
    const head = `A winter gale, gusts of 40 m/s (145 km/h), pushes on the roof and the clerestory with about ${kNm(a.F)} for every metre of the nave, toward the lee side.`;
    const carry = !d.tiers ? ' The lee wall takes it with the vault\'s push.' : sec.upperTier(n) ? ' The upper flyers take it to the buttresses.' : ' The flyers take it to the buttresses with the vault\'s push.';
    const cr = a.cracks.length ? ` It stands, cracked: ${a.cracks.map(c => `the ${c.what}'s base ${c.when === 'storm' ? 'in the storm' : 'in calm air'}`).join(', ')}, outside the middle third. A builder would watch those joints.` : ' It stands, and every base still presses down along its whole width.';
    return head + carry + cr;
  }

  // ---------- The collapse ----------
  // which pieces fall, and how: the vaults straight down; a wall or a buttress that tips takes the vault and its flyers with
  // it, outward from the church, top first. At the strike, everything on the section; in the storm, the lee side (west of
  // nothing: the half at negative x, which the camera opens on) of the nave, the choir and the apse, with the vaults and
  // the roofs, while the transept's arms stand
  const falls = a.falls ? (() => {
    const storm = a.falls.when === 'storm', what = a.falls.what, motions = {}, RT = storm ? '(?:N|C)' : '(?:N|C|TN|TS)';
    const vault = new RegExp(`^(${RT}(TR\\d|DA\\d|DB\\d|BOSS|WR[AB]|WEB)|X(DA|DB|BOSS|WEB)|AP(R\\d|WEB))`);
    const roof = new RegExp(`^(${RT}(RT|RR|RK|RG|LD|LA)|XLD|XSP|AP(RF|LD|LA))`);
    const wall = new RegExp(`^(${RT}(B|D|C|AB|P|SH|S|TF|CL|CO|A|GLC|GLT|FYL|FYU|FYO)-[AB]\\d|AP(B|D|C|AB|P|WS|WT|WC|CO|A|GLC|FYL|FYU|FYO)-\\d)`);
    const butt = new RegExp(`^(${RT}(BU|PN|BI|PI)-[AB]\\d|AP(BU|PN|BI|PI)-\\d)`);
    const apC = eastRun.F.P(0, 0, eastRun.lines[eastI]);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const p of pieces) {
      if (p.until != null) continue;
      const isVault = vault.test(p.id), isWall = what !== 'vault' && wall.test(p.id), isButt = what === 'buttress' && butt.test(p.id), isRoof = storm && roof.test(p.id);
      if (!(isVault || isWall || isButt || isRoof)) continue;
      p.geo.computeBoundingBox(); const c = p.geo.boundingBox.getCenter(p.geo.boundingBox.min.clone());
      if (storm && (isWall || isButt) && c.x > 0) continue;
      let dir = [0, 0];
      if (isWall || isButt) { if (p.id.startsWith('AP')) { const dx = c.x - apC.x, dz = c.z - apC.z, l = Math.hypot(dx, dz) || 1; dir = [dx / l, dz / l]; }
        else { const r = runs.filter(q => p.id.startsWith(q.T)).sort((x, y) => y.T.length - x.T.length)[0], sd = /-A\d/.test(p.id) ? -1 : 1; dir = [r.F.u[0] * sd, r.F.u[1] * sd]; } }
      else if (storm) dir = [-1, 0];
      motions[p.id] = { out: isVault ? (storm ? 0.12 : 0.02) : isRoof ? 0.18 : 0.32, dir, delay: isVault ? 0.15 + rnd() * 0.35 : rnd() * 0.25, spin: (rnd() - 0.5) * 2.4, axis: [rnd() - 0.5, 0, rnd() - 0.5], rest: 0.3 + rnd() * 1.6 };
    }
    return { step: STEP_FALL, motions };
  })() : null;

  K.finish();
  const tonnes = pieces.filter(p => p.until == null && (p.mat === 'stone' || p.mat === 'web')).reduce((s, p) => s + p.w, 0) / 9.81;
  const zW = WEST ? WEST.z : nave.lines.at(-1), zE = EAST ? eastRun.F.P(0, 0, EAST.z).z : null;
  // the church's extent along z, for the cutaway's range
  let zmin = Infinity, zmax = -Infinity; for (const p of pieces) { p.geo.computeBoundingBox(); zmin = Math.min(zmin, p.geo.boundingBox.min.z); zmax = Math.max(zmax, p.geo.boundingBox.max.z); }
  const verdictWords = a.falls ? (a.falls.when === 'strike' ? 'It falls when the centering is struck.' : 'It stands until the first great storm, and falls.') : a.cracks.length ? 'It stands, with cracks.' : 'It stands, without a crack.';
  const KIT = {
    id: 'yours', name: 'Design your own', place: name, title: name, matchup: name,
    lede: `${name}: a ${d.shape} vault ${m(a.crown)} up and ${m(d.span)} wide, walls ${m(d.wall)} thick, ${n === 2 ? 'two aisles' : 'an aisle'} on each side, ${tier}${d.tiers ? ` and buttresses ${m(d.bdepth)} deep` : ''}, a nave of ${nb} bays${d.transept ? `, a transept and a choir of ${d.choir}` : ''}${apsed ? ', an apse' : ''}. ${verdictWords}`,
    about: [
      `Your design, built the way Amiens is in this lab: the ${d.transept ? 'nave, the transept and the choir together' : 'nave'} first, on centering, footings to roof${d.transept ? ', the crossing with them' : ''}, then the west front${d.towers ? ', its towers' : ''}${d.transept ? ', the ends of the transept' : ''} and the ${apsed ? 'apse' : 'east end'}${d.spire ? ', the spire' : ''}${d.chapels ? ', the chapels' : ''}, the glass, and then the first great storm.`,
      `The levels follow from your choices in Amiens' proportions: the arcade, the aisle walls, the triforium and the clerestory all scale with the height of the springing, here ${m(H0)}. About ${Math.round(tonnes / 100) * 100} tonnes of stone in ${pieces.filter(p => p.until == null).length} pieces.`,
      `The physics: the vault pushes out with about ${kNm(a.H)} per metre${a.ok ? '' : ' (or would, if any line of thrust fitted inside it)'}; in the storm the wind adds ${kNm(a.F)} on the lee side. ${verdictWords}`,
      'Simplified: every bay is the same; the ends are plain walls with a rose; the crossing piers are ordinary piers; the apse has the same section as the nave. The collapse is drawn, not computed. The storm is a steady push of 1 kN on every square metre of roof and clerestory, gusts of about 40 m/s.',
    ],
    cut: { min: +(zmin - 1).toFixed(1), max: +(zmax + 1).toFixed(1), value: +(nave.lines[Math.floor(nave.lines.length / 2)] + L / 2).toFixed(1) },
    start: { title: 'An empty site', note: `${name}, ready to build: ${steps.length} steps. Press Next step to set the first footing.` },
    open: falls ? falls.step : steps.length,
    falls, person: [-2.2, zW + 6],
    back: { href: `design/?${query(d)}`, label: 'Change the design' },
    assessment: { verdict: a.verdict, falls: a.falls, crown: a.crown },
  };
  const HIDERS = [...(WEST ? [{ step: STEP_FRONT, west: zW - 2, msg: 'From the west, the front hides the vault.' }] : []), ...(EAST ? [{ step: STEP_EAST, east: zE + 1.6, msg: 'From the east, the end wall hides the vault.' }] : [])];
  return { pieces, steps, KIT, HIDERS, STEP_STRUCK: NAVE.STEP_STRUCK, forceLines: () => [...NAVE.forceLines(), ...(APSE ? APSE.forceLines() : [])], live: K.live, computeLoads: K.computeLoads };
}
