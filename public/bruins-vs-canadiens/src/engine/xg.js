// Expected goals from the fitted model in data/xg-model.json, and the finishing multiplier per shooter.
import * as DM from './detmath.js?v=0.57';

export function makeXg(XG) {
  // Expected goals: the logistic model fit on MoneyPuck shots (see the data file's recipe). Angle is from the net's
  // midline in degrees, distance from the net center in feet. Returns the probability a league-average shooter scores.
  const XGF = XG && XG.shooters ? Object.fromEntries(Object.values(XG.shooters).map(sh => [sh.name.toLowerCase(), sh.finishing])) : {};
  function xgModel(distFt, angleDeg, ctx) {
    if (!XG) return null;
    const c = XG.model.coef, d = Math.max(0, distFt), a = Math.min(90, Math.abs(angleDeg));
    const df = XG.model.defaults || {};
    let z = XG.model.intercept + c.speed * (ctx && ctx.speed !== undefined ? ctx.speed : df.speed || 0) + c.offWing * (ctx && ctx.offWing !== undefined ? ctx.offWing : df.offWing || 0) + c.dist * d + c.logDist * DM.log(d + 1) + c.dist2 * d * d / 100 + c.angle * a + c.angle2 * a * a / 100 + c.distAngle * d * a / 100;
    if (ctx) { if (ctx.rebound) z += c.rebound; if (ctx.rush && c.rush !== undefined) z += c.rush; if (ctx.pp) z += c.pp; if (ctx.sh) z += c.sh; if (ctx.type && c['type_' + ctx.type] !== undefined) z += c['type_' + ctx.type]; }
    return 1 / (1 + DM.exp(-z));
  }
  const xgTier = p => p >= XG.tiers.high.minXg ? 'high' : p >= XG.tiers.low.maxXg ? 'medium' : 'low';
  return { XGF, xgModel, xgTier };
}
