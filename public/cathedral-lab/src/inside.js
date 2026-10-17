// Going inside: stand in a building at eye height at any step, and look around. Drag to look, tap a floor to walk there,
// arrow keys or WASD to walk; the step controls keep working, so you can stand in the nave and watch the vault close over
// you. You always stand on whatever is built under you: step back past the floor you are on and you sink to the one
// below, down to the ground or the bottom of the cellar hole. A plan in the corner, cut at waist height, shows where you
// are; a building's named places (KIT.views) take you to the spots worth standing in, and its rooms (KIT.rooms) say
// where you are.
//
// The 3D page installs it with what it needs and calls tick() every frame; nothing here knows any building.
import * as THREE from './vendor/three.module.js?v=0.14';

const EYE = 1.6, STEP_UP = 0.45, RADIUS = 0.25, WALK = 1.5, RUN = 4, G = 9.8;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function installInside({ scene, camera, controls, cv, pieces, live, state, KIT, BOUNDS, groundY, hitAt, select, redraw, forceMat, $ }) {
  const S = { on: false, feet: V3(), vy: 0, yaw: 0, pitch: 0, fov: 60, glide: null, fly: null, keys: new Set(), saved: null, planKey: '' };
  const VIEWS = KIT.views || [], ROOMS = KIT.rooms || [];
  let lastPlace = null;

  // ---------- Standing ----------
  // Which pieces you can stand on or bump into: whatever is drawn at this step, except glass and screens
  const solid = p => p.batch.mesh.visible && live(p, state.n) && p.mat !== 'glass' && p.mat !== 'screen' && !p.site;
  const tri = [V3(), V3(), V3()], at = V3(), e1 = V3(), e2 = V3(), ray = new THREE.Ray(), hitBox = V3();
  function triangles(p, fn) {
    const g = p.batch.mesh.geometry, pos = g.attributes.position.array, idx = g.index.array;
    for (let t = p.i0; t < p.i0 + p.in; t += 3) { for (let q = 0; q < 3; q++) { const v = idx[t + q] * 3; tri[q].set(pos[v], pos[v + 1], pos[v + 2]); } if (fn() === false) return; }
  }
  // the highest level surface under (x, z) at or below yTop: the top of any square-cut piece under your feet (a joist, a
  // plank, a slab; so a row of joists with gaps between them still holds you), or what a few rays spread over your feet
  // find on anything shaped; the ground, or the cellar hole's bottom, if nothing is built there
  const squareCut = p => p.vn === 24;
  function floorAt(x, z, yTop) {
    let best = groundY(x, z);
    if (best > yTop) best = -Infinity;
    for (const p of pieces) {
      const b = p.box;
      if (!squareCut(p) || b.max.y > yTop || b.max.y <= best || x + RADIUS < b.min.x || x - RADIUS > b.max.x || z + RADIUS < b.min.z || z - RADIUS > b.max.z || !solid(p)) continue;
      best = b.max.y;
    }
    for (const [dx, dz] of [[0, 0], [RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      const px = x + dx, pz = z + dz;
      ray.origin.set(px, yTop, pz); ray.direction.set(0, -1, 0);
      for (const p of pieces) {
        const b = p.box;
        if (squareCut(p) || px < b.min.x || px > b.max.x || pz < b.min.z || pz > b.max.z || b.min.y > yTop || b.max.y <= best || !solid(p)) continue;
        triangles(p, () => {
          if (!ray.intersectTriangle(tri[0], tri[1], tri[2], false, at) || at.y > yTop || at.y <= best) return;
          e1.subVectors(tri[1], tri[0]); e2.subVectors(tri[2], tri[0]); e1.cross(e2).normalize();
          if (Math.abs(e1.y) > 0.6) best = at.y;          // level enough to stand on, not a wall
        });
      }
    }
    return best;
  }
  // the nearest piece along a ray within dist (for walking into walls)
  function blocked(from, dir, dist) {
    ray.origin.copy(from); ray.direction.copy(dir);
    for (const p of pieces) {
      if (!ray.intersectBox(p.box, hitBox) || ray.origin.distanceTo(hitBox) > dist || !solid(p)) continue;
      let hit = false;
      triangles(p, () => { if (ray.intersectTriangle(tri[0], tri[1], tri[2], false, at) && ray.origin.distanceTo(at) < dist) { hit = true; return false; } });
      if (hit) return true;
    }
    return false;
  }

  // ---------- The camera ----------
  const look = () => V3(-Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), -Math.cos(S.yaw) * Math.cos(S.pitch));
  function aim(from, to) { const d = to.clone().sub(from); S.yaw = Math.atan2(-d.x, -d.z); S.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
  function place() {
    const eye = S.feet.clone().add(V3(0, EYE, 0)), d = look();
    camera.position.copy(eye); camera.lookAt(eye.clone().add(d)); controls.target.copy(eye).addScaledVector(d, 4);
    lantern.position.copy(eye).add(V3(0, 2.2, 0)).addScaledVector(d, -1.5);   // above and behind you, so glass does not show it
    if (camera.fov !== S.fov) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
  }
  // a lantern you carry, so a roofed nave or a cellar is not black
  const lantern = new THREE.PointLight(0xfff1dc, 0, 45, 1.6); scene.add(lantern);

  // ---------- In and out ----------
  function enter(v = firstView()) {
    if (S.on) { if (v) goTo(v); return; }
    S.on = true; S.saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
    controls.enabled = false; state.camT = null; forceMat.opacity = 0.5;
    const target = viewFeet(v), from = camera.position.clone(), q0 = camera.quaternion.clone();
    if (v) lastPlace = { v, at: v.at, y: target.feet.y };
    S.feet.copy(target.feet); aim(target.feet.clone().add(V3(0, EYE, 0)), target.look); S.fov = 60;
    // fly from where the camera is into the place, then hand over to the first-person view
    const eye = target.feet.clone().add(V3(0, EYE, 0)), q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, eye.clone().add(look()), V3(0, 1, 0)));
    S.fly = { t0: performance.now(), from, q0, eye, q1 };
    camera.near = 0.05; camera.updateProjectionMatrix();
    lantern.intensity = 0.7;
    S.planKey = ''; sync(); redraw();
  }
  function exit() {
    if (!S.on) return;
    S.on = false; S.glide = S.fly = null; S.keys.clear();
    controls.enabled = true; lantern.intensity = 0; ring.visible = false; forceMat.opacity = 1;
    camera.near = 0.5; camera.fov = S.saved.fov; camera.updateProjectionMatrix();
    controls.target.copy(camera.position).addScaledVector(look(), 6);
    state.camT = { t0: performance.now(), fromT: controls.target.clone(), toT: S.saved.target, fromP: camera.position.clone(), toP: S.saved.pos };
    sync(); redraw();
  }
  // a named place: where your feet go (on whatever is built there now) and where you look
  function viewFeet(v) {
    if (!v) { const c = BOUNDS.getCenter(V3()); return { feet: V3(c.x, floorAt(c.x, c.z, 2), c.z), look: V3(c.x, EYE, BOUNDS.min.z) }; }
    const [x, y, z] = v.at, f = floorAt(x, z, y + 1.0);
    return { feet: V3(x, Number.isFinite(f) ? f : y, z), look: V3(...v.look) };
  }
  // a place you can stand on now: on the ground, or on something built within reach of where its floor will be
  const ready = v => v.at[1] < 1 || floorAt(v.at[0], v.at[2], v.at[1] + 1.0) > v.at[1] - 1.5;
  const firstView = () => VIEWS.find(ready) || null;
  function goTo(v) { const t = viewFeet(v); lastPlace = { v, at: v.at, y: t.feet.y }; S.glide = null; S.vy = 0; S.feet.copy(t.feet); aim(t.feet.clone().add(V3(0, EYE, 0)), t.look); S.planKey = ''; S.dirtyLook = true; sync(); redraw(); }
  function walkTo(p) {
    const d = Math.hypot(p.x - S.feet.x, p.z - S.feet.z);
    S.glide = { t0: performance.now(), from: S.feet.clone(), to: p.clone(), T: Math.min(1.8, 0.35 + d * 0.07) * 1000 };
  }

  // ---------- Each frame ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!S.on) return false;
    if (S.fly) {
      const t = Math.min(1, (now - S.fly.t0) / 900), e = 1 - (1 - t) * (1 - t) * (1 - t);
      camera.position.lerpVectors(S.fly.from, S.fly.eye, e); camera.quaternion.slerpQuaternions(S.fly.q0, S.fly.q1, e);
      if (t >= 1) { S.fly = null; place(); }
      return true;
    }
    let moved = false;
    if (S.glide) {
      const t = Math.min(1, (now - S.glide.t0) / S.glide.T), e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      S.feet.lerpVectors(S.glide.from, S.glide.to, e); if (t >= 1) S.glide = null; moved = true;
    } else if (S.keys.size) {
      // walk: forward and back, step sideways, turn; slide along a wall rather than stop dead
      const k = S.keys, fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0), side = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0), turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0);
      S.yaw += turn * 1.6 * dt;
      const sp = (k.has('shift') ? RUN : WALK) * dt, f = V3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)), r = V3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
      const mv = f.multiplyScalar(fwd * sp).add(r.multiplyScalar(side * sp));
      for (const m of [mv, V3(mv.x, 0, 0), V3(0, 0, mv.z)]) {
        const len = m.length(); if (len < 1e-6) continue;
        const dir = m.clone().divideScalar(len), clear = [STEP_UP + 0.1, 1.0, 1.5].every(h => !blocked(S.feet.clone().add(V3(0, h, 0)), dir, len + RADIUS));
        if (clear) { S.feet.add(m); moved = true; break; }
      }
      moved = moved || turn !== 0;
    }
    // stand on what is under you: up a stair, or down when what you stood on is not built yet
    if (!S.glide) {
      const f = floorAt(S.feet.x, S.feet.z, S.feet.y + STEP_UP);
      if (f > S.feet.y - 0.01) { if (f !== S.feet.y) { S.feet.y = f; moved = true; } S.vy = 0; }
      else if (Number.isFinite(f)) { S.vy = Math.min(14, S.vy + G * 0.6 * dt); S.feet.y = Math.max(f, S.feet.y - S.vy * dt); moved = true; }
    }
    if (moved || S.dirtyLook) { S.dirtyLook = false; place(); if (moved) sync(); return true; }
    return false;
  }

  // ---------- Look, walk, zoom ----------
  const ptrs = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', e => { if (!S.on) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov: S.fov }; } });
  cv.addEventListener('pointermove', e => {
    if (!S.on) return;
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(e); return; }
    const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; S.fov = Math.max(25, Math.min(80, pinch.fov * pinch.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])))); S.dirtyLook = true; return; }
    // drag the view: the scene follows your finger, as in a street-level photo viewer
    const k = 0.0045 * S.fov / 60;
    S.yaw += (e.clientX - px) * k; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + (e.clientY - py) * k)); S.dirtyLook = true; S.glide = null; ring.visible = false;
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function zoom(dy) { S.fov = Math.max(25, Math.min(80, S.fov * Math.exp(dy * 0.0012))); S.dirtyLook = true; }
  const KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift']);
  addEventListener('keydown', e => {
    if (!S.on || e.target.closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { exit(); return; }
    if (KEYS.has(k)) { S.keys.add(k); S.glide = null; e.preventDefault(); }
  });
  addEventListener('keyup', e => S.keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => S.keys.clear());

  // a tap: on a floor, walk there; on anything else, inspect it
  function tap(e) {
    const hit = hitAt(e);
    if (hit) {
      const f = floorAt(hit.point.x, hit.point.z, hit.point.y + 0.05);
      if (Math.abs(f - hit.point.y) < 0.06) { walkTo(V3(hit.point.x, f, hit.point.z)); select(null); return; }
      select(hit.piece); return;
    }
    const p = groundHit(e); if (p) { walkTo(p); select(null); }
  }
  const rc = new THREE.Raycaster();
  function groundHit(e) {
    const r = cv.getBoundingClientRect(); rc.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
    const p = rc.ray.intersectPlane(new THREE.Plane(V3(0, 1, 0), 0), V3());
    if (!p || p.distanceTo(camera.position) > 120) return null;
    p.y = floorAt(p.x, p.z, 0.05); return Number.isFinite(p.y) ? p : null;
  }
  // with a mouse, a ring on the floor where a click would take you
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  ring.visible = false; ring.renderOrder = 5; scene.add(ring);
  let hoverQ = null;
  function hover(e) {
    if (hoverQ) return; hoverQ = requestAnimationFrame(() => {
      hoverQ = null; const hit = hitAt(e); let p = null;
      if (hit) { const f = floorAt(hit.point.x, hit.point.z, hit.point.y + 0.05); if (Math.abs(f - hit.point.y) < 0.06) p = V3(hit.point.x, f, hit.point.z); } else p = groundHit(e);
      ring.visible = !!p; if (p) ring.position.set(p.x, p.y + 0.02, p.z); cv.style.cursor = p ? 'pointer' : ''; redraw();
    });
  }

  // ---------- The panel: where you are, the places, the plan ----------
  const panel = $('inside'), map = $('minimap'), ctx = map.getContext('2d'), sel = $('places');
  sel.innerHTML = '<option value="">Go to…</option>' + VIEWS.map((v, i) => `<option value="${i}">${v.name}</option>`).join('');
  sel.onchange = () => { const v = VIEWS[+sel.value]; sel.value = ''; if (v) goTo(v); };
  $('outside').onclick = exit;
  // the plan's frame: the building's long side across, west on the left
  const along = BOUNDS.max.z - BOUNDS.min.z >= BOUNDS.max.x - BOUNDS.min.x;
  const W = map.width, H = map.height, pad = 10;
  const ext = along ? [BOUNDS.max.z - BOUNDS.min.z, BOUNDS.max.x - BOUNDS.min.x] : [BOUNDS.max.x - BOUNDS.min.x, BOUNDS.max.z - BOUNDS.min.z];
  const sc = Math.min((W - 2 * pad) / ext[0], (H - 2 * pad) / ext[1]), ox = (W - ext[0] * sc) / 2, oy = (H - ext[1] * sc) / 2;
  const toMap = (x, z) => along ? [ox + (BOUNDS.max.z - z) * sc, oy + (x - BOUNDS.min.x) * sc] : [ox + (x - BOUNDS.min.x) * sc, oy + (z - BOUNDS.min.z) * sc];
  const fromMap = (mx, my) => along ? [BOUNDS.min.x + (my - oy) / sc, BOUNDS.max.z - (mx - ox) / sc] : [BOUNDS.min.x + (mx - ox) / sc, BOUNDS.min.z + (my - oy) / sc];
  let planImg = null;
  function drawPlan() {
    // cut at waist height above your feet: what stands there is drawn dark, the floors under you light
    const cut = S.feet.y + 1.0, key = `${state.n}|${Math.round(cut * 2)}`;
    if (key !== S.planKey) {
      S.planKey = key; const cs = getComputedStyle(document.documentElement);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = cs.getPropertyValue('--bg').trim() || '#eee'; g.fillRect(0, 0, W, H);
      const rect = (b, fill) => { const [a0, b0] = toMap(b.min.x, b.min.z), [a1, b1] = toMap(b.max.x, b.max.z); g.fillStyle = fill; g.fillRect(Math.min(a0, a1), Math.min(b0, b1), Math.max(1, Math.abs(a1 - a0)), Math.max(1, Math.abs(b1 - b0))); };
      for (const p of pieces) if (live(p, state.n) && !p.site && squareCut(p) && p.box.max.y <= S.feet.y + 0.1 && p.box.max.y > S.feet.y - 1.5) rect(p.box, 'rgba(140,150,165,0.10)');
      const ink = cs.getPropertyValue('--fg').trim() || '#222';
      // a piece made of many parts (a house's trim, a row of shutters) has a box round all of them, so only compact pieces and
      // square-cut ones are drawn
      const compact = p => squareCut(p) || (p.box.max.x - p.box.min.x) * (p.box.max.z - p.box.min.z) < 6;
      g.globalAlpha = 0.85; for (const p of pieces) if (live(p, state.n) && !p.site && p.mat !== 'glass' && compact(p) && p.box.min.y <= cut && p.box.max.y >= cut) rect(p.box, ink);
      g.globalAlpha = 1; planImg = c;
    }
    ctx.clearRect(0, 0, W, H); ctx.drawImage(planImg, 0, 0);
    // you: a dot and the way you face
    const [mx, my] = toMap(S.feet.x, S.feet.z), d = look(), [dx, dy] = along ? [-d.z, d.x] : [d.x, d.z], a = Math.atan2(dy, dx);
    ctx.fillStyle = 'rgba(208,69,75,0.25)'; ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, 26, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d0454b'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  map.addEventListener('click', e => {
    const r = map.getBoundingClientRect(), [x, z] = fromMap((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
    const f = floorAt(x, z, S.feet.y + STEP_UP); if (Number.isFinite(f)) walkTo(V3(x, f, z));
  });
  // the room you are in, else the place you last went to while you are still near it
  const roomAt = () => ROOMS.find(r => S.feet.x >= r.x0 && S.feet.x <= r.x1 && S.feet.z >= r.z0 && S.feet.z <= r.z1 && S.feet.y >= r.y0 - 0.2 && S.feet.y < r.y1);
  function sync() {
    panel.hidden = !S.on; $('fit').hidden = S.on;
    $('v-inside').setAttribute('aria-pressed', String(S.on));
    if (!S.on) return;
    const r = roomAt(), near = lastPlace && Math.hypot(S.feet.x - lastPlace.at[0], S.feet.z - lastPlace.at[2]) < 4 && Math.abs(S.feet.y - lastPlace.y) < 1.5;
    $('room').textContent = r ? r.name : near ? lastPlace.v.name : S.feet.y > 3 ? `${Math.round(S.feet.y)} m up` : KIT.insideName || 'Inside';
    [...sel.options].forEach((o, i) => { if (i) { const v = VIEWS[i - 1], ok = ready(v); o.disabled = !ok; o.textContent = ok ? v.name : `${v.name} (not built yet)`; } });
    drawPlan();
  }
  // the step changed: you may now have a floor under you, or no longer
  function stepped() { if (S.on) { S.planKey = ''; sync(); } }
  return { enter, exit, tick, tap, zoom, stepped, get on() { return S.on; }, get feet() { return S.feet.clone(); }, floorAt, views: VIEWS, goTo };
}
