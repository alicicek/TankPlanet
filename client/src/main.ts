import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const PLANET_RADIUS = 30;
const HOVER = 0.6;
const movement = {
  maxSpeed: 60, // dialed back from 120
  thrust: 90, // softer push than 180
  turnSpeed: 2.5,
  turnSmooth: 7, // lower = softer yaw acceleration, higher = snappier
  drag: 4, // a bit more drag to cap top speed
};
const INPUT_RATE = 1 / 25;
// Camera tuning
const CAM_INNER_ANGLE = THREE.MathUtils.degToRad(10);
const CAM_OUTER_ANGLE = THREE.MathUtils.degToRad(35);
const CAM_FOLLOW_RATE = 3.5; // how quickly focusDir recenters toward the tank (per second)
const CAM_HEIGHT = 60; // distance above planet surface
const CAM_POS_LERP = 0.1;
const CAM_LOOK_LERP = 0.15;

interface SnapshotPlayer {
  id: number;
  pos: [number, number, number];
  vel: [number, number, number];
  heading: [number, number, number];
  yaw: number;
  yawVel?: number;
  hp: number;
  score: number;
  alive: boolean;
}

interface SnapshotMessage {
  type: 'snap';
  time: number;
  players: SnapshotPlayer[];
  meteors: { id: number; pos: [number, number, number]; target: [number, number, number] }[];
  pickups: { id: number; pos: [number, number, number]; payload: string }[];
  fire: { id: number; center: [number, number, number]; radius: number; ttl: number }[];
}

interface EventMessage {
  type: 'event';
  kind: 'kill' | 'respawn' | 'pickup' | 'meteorImpact';
  killer?: number;
  victim?: number;
  player?: number;
  payload?: string;
}

interface WelcomeMessage {
  type: 'welcome';
  playerId: number;
  match: { state: string; timeLeft: number; scoreCap: number };
  planet: { radius: number };
  tuning?: { maxSpeed: number; thrust: number; turnSpeed?: number; turnSmooth?: number; drag?: number };
}

type ServerMessage = SnapshotMessage | EventMessage | WelcomeMessage;

type Vec3 = { x: number; y: number; z: number };
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

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('No app root');

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <div class="row"><strong>Tank</strong><span id="hud-player">--</span></div>
  <div class="row">HP<div class="bar"><div class="fill" id="hud-hp"></div></div></div>
  <div class="weapon-ui">Weapon: <span id="hud-weapon">Blaster</span></div>
`;
app.appendChild(hud);
const killfeed = document.createElement('div');
killfeed.className = 'killfeed';
app.appendChild(killfeed);
const centerMsg = document.createElement('div');
centerMsg.className = 'center-msg';
centerMsg.textContent = 'Connecting...';
app.appendChild(centerMsg);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.toneMappingExposure = 1.45; // brighten overall scene
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#06070c');
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, PLANET_RADIUS * 0.6, PLANET_RADIUS * 1.8);
camera.lookAt(0, 0, 0);

const ambient = new THREE.AmbientLight('#f4f5ff', 0.95);
scene.add(ambient);
const hemi = new THREE.HemisphereLight('#ffe7c2', '#1a0f08', 0.85);
scene.add(hemi);
const dir = new THREE.DirectionalLight('#ffb36b', 2.4);
dir.position.set(25, 40, 12);
scene.add(dir);
const rim = new THREE.DirectionalLight('#6ebeff', 0.6);
rim.position.set(-20, -10, -5);
scene.add(rim);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const afterimagePass = new AfterimagePass(0.75); // motion trail factor (0..1)
composer.addPass(afterimagePass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.8, 0.85);
composer.addPass(bloomPass);

// Space stars
const starsGeom = new THREE.BufferGeometry();
const starCount = 1600;
const positions = new Float32Array(starCount * 3);
const colors = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const p = v.scale(v.norm({
    x: Math.random() - 0.5,
    y: Math.random() - 0.5,
    z: Math.random() - 0.5,
  }), 220 + Math.random() * 80);
  positions[i * 3] = p.x;
  positions[i * 3 + 1] = p.y;
  positions[i * 3 + 2] = p.z;
  const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.08, 0.4 + Math.random() * 0.3, 0.7 + Math.random() * 0.2);
  colors[i * 3] = c.r;
  colors[i * 3 + 1] = c.g;
  colors[i * 3 + 2] = c.b;
}
starsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
starsGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const starsMat = new THREE.PointsMaterial({ vertexColors: true, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.8 });
scene.add(new THREE.Points(starsGeom, starsMat));

// Planet
const texLoader = new THREE.TextureLoader();
const marsAlbedo = texLoader.load('/mars_albedo2.png');
marsAlbedo.wrapS = THREE.RepeatWrapping;
marsAlbedo.wrapT = THREE.RepeatWrapping;
marsAlbedo.colorSpace = THREE.SRGBColorSpace;
marsAlbedo.anisotropy = renderer.capabilities.getMaxAnisotropy();

const planetMat = new THREE.MeshStandardMaterial({
  map: marsAlbedo,
  roughness: 0.75,
  metalness: 0.05,
  emissive: new THREE.Color('#7a2f1e').multiplyScalar(0.22),
});
const planetGeom = new THREE.SphereGeometry(PLANET_RADIUS, 96, 96);
const planet = new THREE.Mesh(planetGeom, planetMat);
planet.receiveShadow = true;
scene.add(planet);

// Tanks and entities
const tankMeshes = new Map<number, THREE.Object3D>();
const pickupMeshes = new Map<number, THREE.Object3D>();
const fireMeshes = new Map<number, THREE.Mesh>();
const renderStates = new Map<number, { pos: THREE.Vector3; targetPos: THREE.Vector3; heading: THREE.Vector3; targetHeading: THREE.Vector3; yaw: number; targetYaw: number }>();
let playerId: number | null = null;
let playerName = 'Pilot';
let localState: SnapshotPlayer | null = null;
let lastSnapshotTime = 0;
let gotSnapshot = false;
const camState = { eye: new THREE.Vector3(), look: new THREE.Vector3() };
let camInitialized = false;
// Planet-face camera state
let focusDir: THREE.Vector3 | null = null;
const _tankPos = new THREE.Vector3();
const _tankDir = new THREE.Vector3();
const _focusTmp = new THREE.Vector3();
const _lookTmp = new THREE.Vector3();
const _upTmp = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _fallbackZ = new THREE.Vector3(0, 0, 1);
const _viewTmp = new THREE.Vector3();

// Input tracking
const input = { thrust: 0 as -1 | 0 | 1, turn: 0 as -1 | 0 | 1, fire: false, power: false };
let inputSeq = 0;

let socket: WebSocket | null = null;
let lastFrame = performance.now();

function createTankMesh(color: string) {
  const group = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(2.4, 1.1, 3.2);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  group.add(body);

  const turretGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.8, 8);
  const turret = new THREE.Mesh(turretGeo, bodyMat);
  turret.position.set(0, 1.1, 0);
  group.add(turret);

  const barrelGeo = new THREE.CylinderGeometry(0.18, 0.25, 2.2, 8);
  const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: '#f5e0c7' }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.2, 1.6);
  group.add(barrel);

  const emissive = new THREE.MeshStandardMaterial({ color: '#6ee7ff', emissive: '#6ee7ff', emissiveIntensity: 0.6 });
  const lightStrip = new THREE.BoxGeometry(0.15, 0.12, 2.6);
  const strip = new THREE.Mesh(lightStrip, emissive);
  strip.position.set(1.1, 0.75, 0);
  group.add(strip);

  group.castShadow = true;
  return group;
}

function setHUD(hp: number, nameLabel: string) {
  const hpEl = document.querySelector<HTMLDivElement>('#hud-hp');
  const nameEl = document.querySelector<HTMLSpanElement>('#hud-player');
  if (hpEl) hpEl.style.width = `${Math.max(0, Math.min(100, hp))}%`;
  if (nameEl) nameEl.textContent = nameLabel;
}

function pushKillfeed(text: string) {
  const el = document.createElement('div');
  el.className = 'item';
  el.textContent = text;
  killfeed.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

function stepLocal(dt: number) {
  if (!localState) return;
  const pos: Vec3 = { x: localState.pos[0], y: localState.pos[1], z: localState.pos[2] };
  const vel: Vec3 = { x: localState.vel[0], y: localState.vel[1], z: localState.vel[2] };
  let heading: Vec3 = { x: localState.heading[0], y: localState.heading[1], z: localState.heading[2] };
  const normal = v.norm(pos);

  // Smooth turning; keep yaw for UI/debug, but heading is authoritative.
  const currentYawVel = (localState as any).yawVel ?? 0;
  const targetYawVel = input.turn * movement.turnSpeed;
  const lerp = Math.min(1, movement.turnSmooth * dt);
  const nextYawVel = currentYawVel + (targetYawVel - currentYawVel) * lerp;
  (localState as any).yawVel = nextYawVel;
  const dYaw = nextYawVel * dt;
  localState.yaw += dYaw;

  // Rotate heading about the current normal (Rodrigues).
  const c = Math.cos(dYaw);
  const s = Math.sin(dYaw);
  const crossNH = { x: normal.y * heading.z - normal.z * heading.y, y: normal.z * heading.x - normal.x * heading.z, z: normal.x * heading.y - normal.y * heading.x };
  const dotNH = v.dot(normal, heading);
  heading = v.norm(
    v.add(
      v.add(v.scale(heading, c), v.scale(crossNH, s)),
      v.scale(normal, dotNH * (1 - c))
    )
  );

  // Thrust along heading (tangent already).
  const vel2 = v.add(vel, v.scale(heading, input.thrust * movement.thrust * dt));
  const tangentVel = v.sub(vel2, v.scale(normal, v.dot(vel2, normal)));
  let finalVel = v.scale(tangentVel, Math.max(0, 1 - movement.drag * dt));
  const speed = v.len(finalVel);
  if (speed > movement.maxSpeed) finalVel = v.scale(finalVel, movement.maxSpeed / speed);
  const newPos = v.add(pos, v.scale(finalVel, dt));
  const newNormal = v.norm(newPos);
  const clamped = v.scale(newNormal, PLANET_RADIUS + HOVER);

  // Parallel-transport heading onto new tangent plane.
  heading = v.sub(heading, v.scale(newNormal, v.dot(heading, newNormal)));
  if (v.len(heading) < 1e-6) {
    const ref = Math.abs(newNormal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    heading = v.norm({
      x: newNormal.y * ref.z - newNormal.z * ref.y,
      y: newNormal.z * ref.x - newNormal.x * ref.z,
      z: newNormal.x * ref.y - newNormal.y * ref.x,
    });
  } else {
    heading = v.norm(heading);
  }

  localState.pos = [clamped.x, clamped.y, clamped.z];
  localState.vel = [finalVel.x, finalVel.y, finalVel.z];
  localState.heading = [heading.x, heading.y, heading.z];
}

function updatePlanetCamera(dt: number, tankWorldPos: THREE.Vector3) {
  // 1) Tank position & direction from planet center
  _tankPos.copy(tankWorldPos);
  _tankDir.copy(_tankPos);
  if (_tankDir.lengthSq() < 1e-6) _tankDir.set(0, 1, 0); // fallback
  _tankDir.normalize();

  // 2) Planet-face focus direction (what hemisphere the camera is centred on)
  if (!focusDir || focusDir.lengthSq() < 1e-6) {
    focusDir = _tankDir.clone();
  }

  const dot = THREE.MathUtils.clamp(focusDir.dot(_tankDir), -1, 1);
  const theta = Math.acos(dot);

  if (theta > CAM_INNER_ANGLE) {
    const t = THREE.MathUtils.clamp(
      (theta - CAM_INNER_ANGLE) / (CAM_OUTER_ANGLE - CAM_INNER_ANGLE),
      0,
      1
    );
    const lerpFactor = t * CAM_FOLLOW_RATE * dt;
    focusDir.lerp(_tankDir, lerpFactor).normalize();
  }

  // 3) Desired camera position and look target
  const camRadius = PLANET_RADIUS + CAM_HEIGHT;
  const desiredEye = _focusTmp.copy(focusDir).multiplyScalar(camRadius);

  // Always look at the tank so it stays near screen centre
  const lookTarget = _lookTmp.copy(_tankPos);

  // 4) Stable "up": project worldUp onto the plane orthogonal to the view direction
  _viewTmp.subVectors(lookTarget, desiredEye).normalize(); // camera forward

  _upTmp.copy(_worldUp);
  let proj = _viewTmp.dot(_upTmp);
  _upTmp.addScaledVector(_viewTmp, -proj); // remove component along view

  if (_upTmp.lengthSq() < 1e-6) {
    // worldUp was almost parallel to viewDir, fall back to Z axis
    _upTmp.copy(_fallbackZ);
    proj = _viewTmp.dot(_upTmp);
    _upTmp.addScaledVector(_viewTmp, -proj);
  }

  _upTmp.normalize();

  // 5) Smooth movement
  if (!camInitialized) {
    camState.eye.copy(desiredEye);
    camState.look.copy(lookTarget);
    camInitialized = true;
  } else {
    camState.eye.lerp(desiredEye, CAM_POS_LERP);
    camState.look.lerp(lookTarget, CAM_LOOK_LERP);
  }

  camera.position.copy(camState.eye);
  camera.up.copy(_upTmp);
  camera.lookAt(camState.look);
}

function animate() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  stepLocal(dt);
  renderEntities(dt);

  const myMesh = playerId !== null ? tankMeshes.get(playerId) : undefined;

  if (myMesh) {
    // Drive camera from the actual rendered tank position
    updatePlanetCamera(dt, myMesh.position);
  } else {
    // Idle camera while waiting for first snapshot / mesh
    const cameraRadius = PLANET_RADIUS + CAM_HEIGHT;
    camera.position.set(0, cameraRadius, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camInitialized = false;
    focusDir = null;
  }

  composer.render();
  requestAnimationFrame(animate);
}

function renderEntities(dt: number) {
  if (lastSnapshotTime > 0) setHUD(localState?.hp ?? 0, `${playerName} #${playerId ?? '--'}`);

  const lerp = Math.min(1, 8 * dt); // interpolation factor
  for (const [id, state] of renderStates) {
    const mesh = tankMeshes.get(id);
    if (!mesh) continue;
    state.pos.lerp(state.targetPos, lerp);
    const shortest = Math.atan2(Math.sin(state.targetYaw - state.yaw), Math.cos(state.targetYaw - state.yaw));
    state.yaw = state.yaw + shortest * lerp;
    const normal = state.pos.clone().normalize();
    state.heading.lerp(state.targetHeading, lerp);
    if (state.heading.lengthSq() < 1e-6) {
      const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      state.heading.copy(new THREE.Vector3().crossVectors(normal, ref).normalize());
    } else {
      state.heading.normalize();
    }

    mesh.position.copy(state.pos);
    mesh.up.copy(normal);

    const forward = state.heading.clone().normalize();
    if (forward.lengthSq() < 1e-6) {
      const ref = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      forward.copy(new THREE.Vector3().crossVectors(normal, ref).normalize());
    }
    const eye = mesh.position.clone();
    const target = eye.clone().add(forward);
    const mtx = new THREE.Matrix4().lookAt(eye, target, normal);
    const q = new THREE.Quaternion().setFromRotationMatrix(mtx);
    const alignForward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    mesh.quaternion.copy(q.multiply(alignForward));
  }
}

function handleSnapshot(msg: SnapshotMessage) {
  lastSnapshotTime = msg.time;
  if (!gotSnapshot) {
    gotSnapshot = true;
    console.log('First snapshot received', msg.players.length, 'players');
  }
  for (const state of msg.players) {
    if (state.id === playerId) {
      if (!localState) localState = { ...state };
      else {
        // reconcile softly with error threshold to avoid jitter
        const errX = state.pos[0] - localState.pos[0];
        const errY = state.pos[1] - localState.pos[1];
        const errZ = state.pos[2] - localState.pos[2];
        const errDist = Math.sqrt(errX * errX + errY * errY + errZ * errZ);
        const posBlend = errDist < 0.5 ? 0.05 : 0.15;
        localState.pos = [
          localState.pos[0] + errX * posBlend,
          localState.pos[1] + errY * posBlend,
          localState.pos[2] + errZ * posBlend,
        ];
        // smooth velocity to reduce snapping
        const velBlend = 0.2;
        localState.vel = [
          localState.vel[0] + (state.vel[0] - localState.vel[0]) * velBlend,
          localState.vel[1] + (state.vel[1] - localState.vel[1]) * velBlend,
          localState.vel[2] + (state.vel[2] - localState.vel[2]) * velBlend,
        ];
        // smooth yaw to avoid snapping
        const shortest = Math.atan2(Math.sin(state.yaw - localState.yaw), Math.cos(state.yaw - localState.yaw));
        localState.yaw = localState.yaw + shortest * 0.2;
        // blend heading
        const lh: Vec3 = { x: localState.heading[0], y: localState.heading[1], z: localState.heading[2] };
        const sh: Vec3 = { x: state.heading[0], y: state.heading[1], z: state.heading[2] };
        const headingBlend = 0.25;
        const blended = v.norm({
          x: lh.x + (sh.x - lh.x) * headingBlend,
          y: lh.y + (sh.y - lh.y) * headingBlend,
          z: lh.z + (sh.z - lh.z) * headingBlend,
        });
        localState.heading = [blended.x, blended.y, blended.z];
        localState.hp = state.hp;
        localState.score = state.score;
        localState.alive = state.alive;
      }
    }
    let mesh = tankMeshes.get(state.id);
    if (!mesh) {
      mesh = createTankMesh(randomColor());
      tankMeshes.set(state.id, mesh);
      scene.add(mesh);
    }
    mesh.visible = state.alive;
    // set render targets for interpolation
    let r = renderStates.get(state.id);
    if (!r) {
      r = {
        pos: new THREE.Vector3(...state.pos),
        targetPos: new THREE.Vector3(...state.pos),
        heading: new THREE.Vector3(...state.heading),
        targetHeading: new THREE.Vector3(...state.heading),
        yaw: state.yaw,
        targetYaw: state.yaw,
      };
      renderStates.set(state.id, r);
    } else {
      r.targetPos.set(state.pos[0], state.pos[1], state.pos[2]);
      r.targetHeading.set(state.heading[0], state.heading[1], state.heading[2]);
      r.targetYaw = state.yaw;
      if (!renderStates.has(state.id)) renderStates.set(state.id, r);
    }
  }

  // pickups
  for (const mesh of pickupMeshes.values()) mesh.visible = false;
  msg.pickups.forEach((p) => {
    let mesh = pickupMeshes.get(p.id);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color: '#7effb3', emissive: '#7effb3', emissiveIntensity: 0.4 }));
      pickupMeshes.set(p.id, mesh);
      scene.add(mesh);
    }
    mesh.visible = true;
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  });

  // fire zones
  for (const f of fireMeshes.values()) f.visible = false;
  msg.fire.forEach((f) => {
    let ring = fireMeshes.get(f.id);
    if (!ring) {
      const geo = new THREE.RingGeometry(f.radius - 0.5, f.radius, 48, 1);
      const mat = new THREE.MeshBasicMaterial({ color: '#ff964f', side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2;
      fireMeshes.set(f.id, ring);
      scene.add(ring);
    }
    ring.visible = true;
    const outer = (ring.geometry as any).parameters?.outerRadius ?? f.radius;
    ring.scale.setScalar(f.radius / outer);
    ring.position.set(f.center[0], f.center[1], f.center[2]);
  });
}

function connect() {
  socket = new WebSocket('ws://localhost:3001');
  socket.onopen = () => {
    centerMsg.textContent = 'Joining arena...';
    socket?.send(JSON.stringify({ type: 'join', name: playerName }));
  };
  socket.onmessage = (ev) => {
    const data = JSON.parse(ev.data) as ServerMessage;
    if (data.type === 'welcome') {
      if (data.tuning) {
        movement.maxSpeed = data.tuning.maxSpeed ?? movement.maxSpeed;
        movement.thrust = data.tuning.thrust ?? movement.thrust;
        if (data.tuning.turnSpeed !== undefined) movement.turnSpeed = data.tuning.turnSpeed;
        if (data.tuning.turnSmooth !== undefined) movement.turnSmooth = data.tuning.turnSmooth;
        if (data.tuning.drag !== undefined) movement.drag = data.tuning.drag;
      }
      playerId = data.playerId;
      centerMsg.textContent = '';
      centerMsg.style.display = 'none';
    } else if (data.type === 'snap') {
      handleSnapshot(data);
    } else if (data.type === 'event') {
      if (data.kind === 'kill') pushKillfeed(`${data.killer} eliminated ${data.victim}`);
      if (data.kind === 'pickup') pushKillfeed(`Pickup collected`);
    }
  };
  socket.onclose = () => {
    centerMsg.textContent = 'Disconnected';
    console.warn('Socket closed');
  };
  socket.onerror = (err) => {
    console.error('Socket error', err);
  };
}

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN || playerId === null) return;
  const payload = {
    type: 'input',
    seq: inputSeq++,
    thrust: input.thrust,
    turn: input.turn,
    fire: input.fire,
    power: input.power,
    dt: 16,
  };
  socket.send(JSON.stringify(payload));
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') input.thrust = 1;          // forward only
    if (e.key === 'ArrowLeft') input.turn = 1;   // rotate left
    if (e.key === 'ArrowRight') input.turn = -1; // rotate right
    if (e.key === ' ') input.fire = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') input.thrust = 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') input.turn = 0;
    if (e.key === ' ') input.fire = false;
  });
  renderer.domElement.addEventListener('pointerdown', () => (input.fire = true));
  renderer.domElement.addEventListener('pointerup', () => (input.fire = false));
}

function randomColor() {
  const palette = ['#ff6b6b', '#feca57', '#54a0ff', '#5f27cd', '#1dd1a1'];
  return palette[Math.floor(Math.random() * palette.length)];
}

async function bootstrap() {
  setupInput();
  connect();
  requestAnimationFrame(animate);
  setInterval(() => {
    sendInput();
  }, 1000 * INPUT_RATE * 0.5);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

bootstrap();
