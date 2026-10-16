// The rink: its size in feet, the nets and blue lines, and the helpers that turn a team's own frame (fx from its
// own goal line, fy across the ice) into rink coordinates for whichever end it attacks. Pure: no state.
import * as DM from './detmath.js?v=0.61';

export const RW = 200, RH = 85, GL = 11, NETW = 6, NETD = 4, CORNER = 28;
export const RINK_Y = 13, BENCH_H = 12, BOX_H = 10; // feet above and below the ice for benches and penalty boxes

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => DM.hypot(a.x - b.x, a.y - b.y);

// team-relative coords: fx = distance along attack from own goal line, fy = 0..85
export const toRink = (t, fx, fy) => ({ x: t.dir > 0 ? GL + fx : RW - GL - fx, y: fy });
export const toFx = (t, x) => t.dir > 0 ? x - GL : RW - GL - x;
export const ownNet = t => ({ x: t.dir > 0 ? GL : RW - GL, y: RH / 2 });
export const oppNet = t => ({ x: t.dir > 0 ? RW - GL : GL, y: RH / 2 });
export const zone = (t, x) => { const fx = toFx(t, x); return fx < 64 ? 'own' : fx > 114 ? 'off' : 'neutral'; };
export const endDot = (t, y) => ({ x: ownNet(t).x + t.dir * 20, y: y < 42.5 ? 20.5 : 64.5 });
export const neutralDot = (t, y) => ({ x: t.dir > 0 ? 120 : 80, y: y < 42.5 ? 20.5 : 64.5 });
export const BLUE = [75, 125];
