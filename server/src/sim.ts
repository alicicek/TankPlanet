import type { InputState, PlayerId, PowerupType, Vec3, Vector3Tuple, TuningConfig } from '@shared/types';
import type { FireZoneSnapshot, ServerMessage, SnapshotMessage } from '@shared/protocol';

// Constants
export const PLANET_RADIUS = 30;
const HOVER = 0.6;
const GRAVITY = 50;
const TUNING: Required<TuningConfig> = {
  maxSpeed: 60, // dialed back from 120
  thrust: 90, // softer push than 180
  turnSpeed: 2.5,
  turnSmooth: 12, // higher = snappier yaw acceleration, still eased
  drag: 4, // a bit more drag to cap top speed
};
export const TICK = 1 / 35;
const SNAP_RATE = 1 / 12;
const RESPAWN_DELAY = 2.5;
const FIRE_RATE = 0.25; // seconds per shot default
const DEFAULT_DAMAGE = 25;
const PLAYER_RADIUS = 1.2;
const FIRE_DPS = 15;
const FIRE_DURATION = 7;

// Basic vector helpers
const v = {
  add: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
  len: (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
  norm: (a: Vec3): Vec3 => {
    const l = v.len(a) || 1;
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  },
};
const toTuple = (vec: Vec3): Vector3Tuple => [vec.x, vec.y, vec.z];

interface Player {
  id: PlayerId;
  name: string;
  color: string;
  pos: Vec3;
  vel: Vec3;
  heading: Vec3;
  yaw: number;
  yawVel: number;
  hp: number;
  score: number;
  alive: boolean;
  respawnAt: number;
  lastFire: number;
  input: InputState;
  contrib: Map<PlayerId, number>; // damage contribution
}

interface Projectile {
  id: number;
  owner: PlayerId;
  pos: Vec3;
  vel: Vec3;
  ttl: number;
  damage: number;
  splash: number;
}

interface Meteor {
  id: number;
  type: 'pickup' | 'impact';
  pos: Vec3;
  vel: Vec3;
  target: Vec3;
  impactAt: number;
  landed: boolean;
}

interface Pickup {
  id: number;
  payload: PowerupType;
  pos: Vec3;
  expiresAt: number;
}

interface FireZone {
  id: number;
  center: Vec3;
  radius: number;
  start: number;
  duration: number;
  shrink: number;
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randomPointOnSphere(radius: number): Vec3 {
  const u = Math.random();
  const vRand = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * vRand - 1);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi) * Math.sin(theta);
  const z = radius * Math.cos(phi);
  return { x, y, z };
}

// Prefer a consistent front-facing spawn so the tank begins near the visual center of the planet
function preferredSpawnPoint(radius: number): Vec3 {
  const base = { x: 0, y: 0, z: radius };
  const jitter = radius * 0.05; // slight spread to avoid exact stacking
  const dir = {
    x: base.x + rand(-jitter, jitter),
    y: base.y + rand(-jitter, jitter),
    z: base.z + rand(-jitter, jitter * 0.5),
  };
  return v.norm(dir);
}

function createPlayer(id: PlayerId, name: string, color: string): Player {
  const dir = preferredSpawnPoint(1);
  const pos = v.scale(v.norm(dir), PLANET_RADIUS + HOVER);
  const normal = v.norm(pos);
  const ref = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const heading = v.norm({
    x: normal.y * ref.z - normal.z * ref.y,
    y: normal.z * ref.x - normal.x * ref.z,
    z: normal.x * ref.y - normal.y * ref.x,
  });
  return {
    id,
    name,
    color,
    pos,
    vel: { x: 0, y: 0, z: 0 },
    heading,
    yaw: 0,
    yawVel: 0,
    hp: 100,
    score: 0,
    alive: true,
    respawnAt: 0,
    lastFire: 0,
    input: { seq: 0, thrust: 0, turn: 0, fire: false, power: false, dt: 0 },
    contrib: new Map(),
  };
}

export function createSim() {
  let nextId: PlayerId = 1;
  const players = new Map<PlayerId, Player>();
  const projectiles: Projectile[] = [];
  const meteors: Meteor[] = [];
  const pickups: Pickup[] = [];
  const fireZones: FireZone[] = [];
  let lastSnap = 0;
  let nextMeteorTime = 0;
  const outbound: ServerMessage[] = [];

  const emit = (msg: ServerMessage) => outbound.push(msg);

  function stepPlayer(p: Player, dt: number) {
    const oldNormal = v.norm(p.pos);
    // Smooth turning
    const targetYawVel = p.input.turn * TUNING.turnSpeed;
    const lerp = Math.min(1, TUNING.turnSmooth * dt);
    p.yawVel = p.yawVel + (targetYawVel - p.yawVel) * lerp;
    const dYaw = p.yawVel * dt;
    p.yaw += dYaw;

    // Rotate heading about the current normal (Rodrigues).
    const c = Math.cos(dYaw);
    const s = Math.sin(dYaw);
    const h = p.heading;
    const n = oldNormal;
    const crossNH = { x: n.y * h.z - n.z * h.y, y: n.z * h.x - n.x * h.z, z: n.x * h.y - n.y * h.x };
    const dotNH = v.dot(n, h);
    p.heading = v.norm(
      v.add(
        v.add(v.scale(h, c), v.scale(crossNH, s)),
        v.scale(n, dotNH * (1 - c))
      )
    );

    // Thrust along heading (already tangent to old normal).
    p.vel = v.add(p.vel, v.scale(p.heading, p.input.thrust * TUNING.thrust * dt));
    // project velocity onto tangent
    p.vel = v.sub(p.vel, v.scale(n, v.dot(p.vel, n)));
    // drag
    p.vel = v.scale(p.vel, Math.max(0, 1 - TUNING.drag * dt));
    // clamp speed
    const speed = v.len(p.vel);
    if (speed > TUNING.maxSpeed) p.vel = v.scale(p.vel, TUNING.maxSpeed / speed);
    p.pos = v.add(p.pos, v.scale(p.vel, dt));
    // keep on surface
    const newNormal = v.norm(p.pos);
    p.pos = v.scale(newNormal, PLANET_RADIUS + HOVER);

    // Parallel-transport heading onto new tangent plane.
    p.heading = v.sub(p.heading, v.scale(newNormal, v.dot(p.heading, newNormal)));
    if (v.len(p.heading) < 1e-6) {
      const ref = Math.abs(newNormal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      p.heading = v.norm({
        x: newNormal.y * ref.z - newNormal.z * ref.y,
        y: newNormal.z * ref.x - newNormal.x * ref.z,
        z: newNormal.x * ref.y - newNormal.y * ref.x,
      });
    } else {
      p.heading = v.norm(p.heading);
    }
  }

  function rayHitPlayer(origin: Vec3, dir: Vec3, range: number, ignoreId: PlayerId) {
    let best: { player: Player; dist: number } | null = null;
    const r2 = range * range;
    for (const p of players.values()) {
      if (!p.alive || p.id === ignoreId) continue;
      const toP = v.sub(p.pos, origin);
      const proj = v.dot(toP, dir);
      if (proj < 0 || proj * proj > r2) continue;
      const closest = v.add(origin, v.scale(dir, proj));
      const dist = v.len(v.sub(p.pos, closest));
      if (dist <= PLAYER_RADIUS) {
        if (!best || proj < best.dist) best = { player: p, dist: proj };
      }
    }
    return best?.player ?? null;
  }

  function applyDamage(target: Player, amount: number, sourceId: PlayerId) {
    target.hp -= amount;
    const prev = target.contrib.get(sourceId) || 0;
    target.contrib.set(sourceId, prev + amount);
    if (target.hp <= 0 && target.alive) {
      killPlayer(target, sourceId);
    }
  }

  function flingVector(pos: Vec3): Vec3 {
    const normal = v.norm(pos);
    const jitter = { x: rand(-0.3, 0.3), y: rand(-0.3, 0.3), z: rand(-0.3, 0.3) };
    return v.scale(v.norm(v.add(normal, jitter)), 20);
  }

  function killPlayer(target: Player, killerId: PlayerId) {
    target.alive = false;
    target.respawnAt = Date.now() / 1000 + RESPAWN_DELAY;
    target.vel = flingVector(target.pos);
    emit({ type: 'event', kind: 'kill', killer: killerId, victim: target.id });
    // award kill/assist
    const killer = players.get(killerId);
    if (killer) killer.score += 100;
    for (const [pid, dmg] of target.contrib.entries()) {
      if (pid !== killerId && dmg >= 25) {
        const helper = players.get(pid);
        if (helper) helper.score += 50;
      }
    }
    target.contrib.clear();
  }

  function respawnIfNeeded(p: Player) {
    if (p.alive) return;
    const now = Date.now() / 1000;
    if (now >= p.respawnAt) {
      const dir = preferredSpawnPoint(1);
      p.pos = v.scale(v.norm(dir), PLANET_RADIUS + HOVER);
      p.vel = { x: 0, y: 0, z: 0 };
      const normal = v.norm(p.pos);
      const ref = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      p.heading = v.norm({
        x: normal.y * ref.z - normal.z * ref.y,
        y: normal.z * ref.x - normal.x * ref.z,
        z: normal.x * ref.y - normal.y * ref.x,
      });
      p.hp = 100;
      p.yaw = 0;
      p.yawVel = 0;
      p.alive = true;
      emit({ type: 'event', kind: 'respawn', player: p.id });
    }
  }

  function processFiring(now: number, dt: number) {
    for (const p of players.values()) {
      if (!p.alive || !p.input.fire) continue;
      if (now - p.lastFire < FIRE_RATE) continue;
      p.lastFire = now;
      const dir = v.norm(p.heading);
      const origin = v.add(p.pos, v.scale(dir, 1.5));
      const target = rayHitPlayer(origin, dir, 40, p.id);
      if (target) {
        applyDamage(target, DEFAULT_DAMAGE, p.id);
      }
    }
  }

  function stepProjectiles(dt: number) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];
      proj.pos = v.add(proj.pos, v.scale(proj.vel, dt));
      proj.ttl -= dt;
      if (proj.ttl <= 0) {
        projectiles.splice(i, 1);
        continue;
      }
    }
  }

  function spawnMeteor(now: number) {
    const type = Math.random() < 0.6 ? 'pickup' : 'impact';
    const target = randomPointOnSphere(PLANET_RADIUS);
    const spawnHeight = PLANET_RADIUS + 25;
    const pos = v.scale(v.norm(target), spawnHeight);
    const vel = v.scale(v.norm(v.sub(target, pos)), rand(12, 16));
    meteors.push({ id: nextId++, type, pos, vel, target, landed: false, impactAt: now + rand(1.2, 1.6) });
  }

  function stepMeteors(now: number, dt: number) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.pos = v.add(m.pos, v.scale(m.vel, dt));
      if (now >= m.impactAt && !m.landed) {
        m.landed = true;
        onMeteorImpact(m);
        meteors.splice(i, 1);
      }
    }
  }

  function onMeteorImpact(m: Meteor) {
    if (m.type === 'pickup') {
      const payload: PowerupType = Math.random() < 0.5 ? 'rocket' : 'shotgun';
      pickups.push({ id: nextId++, payload, pos: m.target, expiresAt: Date.now() / 1000 + 20 });
      emit({ type: 'event', kind: 'meteorImpact', id: m.id, result: 'pickup', payload });
    } else {
      const fire: FireZone = {
        id: nextId++,
        center: v.scale(v.norm(m.target), PLANET_RADIUS + 0.05),
        radius: 6,
        start: Date.now() / 1000,
        duration: FIRE_DURATION,
        shrink: 0.5,
      };
      fireZones.push(fire);
      const fireSnapshot: FireZoneSnapshot = {
        id: fire.id,
        center: toTuple(fire.center),
        radius: fire.radius,
        ttl: fire.duration,
      };
      emit({ type: 'event', kind: 'meteorImpact', id: m.id, result: 'fire', fire: fireSnapshot });
    }
  }

  function stepFireZones(now: number, dt: number) {
    for (let i = fireZones.length - 1; i >= 0; i--) {
      const fz = fireZones[i];
      const age = now - fz.start;
      if (age < 0.5) continue; // grace
      fz.radius = Math.max(0, fz.radius - fz.shrink * dt);
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dist = v.len(v.sub(p.pos, fz.center));
        if (dist <= fz.radius) {
          applyDamage(p, FIRE_DPS * dt, 0);
        }
      }
      if (age > fz.duration || fz.radius <= 0.1) fireZones.splice(i, 1);
    }
  }

  function stepPickups(now: number) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pick = pickups[i];
      if (pick.expiresAt <= now) {
        pickups.splice(i, 1);
        continue;
      }
      for (const p of players.values()) {
        if (!p.alive) continue;
        const dist = v.len(v.sub(p.pos, pick.pos));
        if (dist <= PLAYER_RADIUS + 0.5) {
          // grant simple bonus score or note
          p.score += 25;
          emit({ type: 'event', kind: 'pickup', player: p.id, payload: pick.payload });
          pickups.splice(i, 1);
          break;
        }
      }
    }
  }

  function sendSnapshots(now: number) {
    const payload: SnapshotMessage = {
      type: 'snap',
      time: now,
      players: Array.from(players.values()).map((p) => ({
        id: p.id,
        pos: toTuple(p.pos),
        vel: toTuple(p.vel),
        heading: toTuple(p.heading),
        yaw: p.yaw,
        hp: p.hp,
        score: p.score,
        alive: p.alive,
      })),
      meteors: meteors.map((m) => ({ id: m.id, pos: toTuple(m.pos), target: toTuple(m.target) })),
      pickups: pickups.map((p) => ({ id: p.id, pos: toTuple(p.pos), payload: p.payload })),
      fire: fireZones.map<FireZoneSnapshot>((f) => ({
        id: f.id,
        center: toTuple(f.center),
        radius: f.radius,
        ttl: Math.max(0, f.duration - (now - f.start)),
      })),
    };
    emit(payload);
  }

  function tick() {
    const now = Date.now() / 1000;
    for (const p of players.values()) {
      if (p.alive) stepPlayer(p, TICK);
      else respawnIfNeeded(p);
    }
    processFiring(now, TICK);
    stepProjectiles(TICK);
    stepMeteors(now, TICK);
    stepFireZones(now, TICK);
    stepPickups(now);

    if (now >= nextMeteorTime) {
      spawnMeteor(now);
      nextMeteorTime = now + rand(6, 8);
    }

    if (now - lastSnap >= SNAP_RATE) {
      sendSnapshots(now);
      lastSnap = now;
    }

    const msgs = outbound.slice();
    outbound.length = 0;
    return msgs;
  }

  function addPlayer(name: string | ((id: PlayerId) => string), color: string): PlayerId {
    const id = nextId++;
    const resolvedName = typeof name === 'function' ? name(id) : name;
    const player = createPlayer(id, resolvedName, color);
    players.set(player.id, player);
    return id;
  }

  function removePlayer(id: PlayerId) {
    players.delete(id);
  }

  function handleInput(pid: PlayerId, input: InputState) {
    const p = players.get(pid);
    if (!p) return;
    p.input = input;
  }

  function buildWelcomeMessage(pid: PlayerId): ServerMessage {
    return {
      type: 'welcome',
      playerId: pid,
      match: { state: 'active', timeLeft: 999, scoreCap: 800 },
      planet: { radius: PLANET_RADIUS },
      tuning: TUNING,
    };
  }

  return { addPlayer, removePlayer, handleInput, tick, buildWelcomeMessage };
}
