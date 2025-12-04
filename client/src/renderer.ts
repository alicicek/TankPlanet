import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import { PLANET_RADIUS, HOVER, TUNING as DEFAULT_TUNING } from '@shared/config';
import type { SnapshotMessage, Vec3, SnapshotPlayer, InputState, TuningConfig } from '@shared';

const CAM_INNER_ANGLE = (10 * Math.PI) / 180;
const CAM_OUTER_ANGLE = (35 * Math.PI) / 180;
const CAM_FOLLOW_RATE = 3.5;
const CAM_HEIGHT = 60;
const CAM_POS_LERP = 0.1;
const CAM_LOOK_LERP = 0.15;

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

export function createRenderer(opts: {
  canvas: HTMLCanvasElement;
  hudPlayer: HTMLElement;
  hpFill: HTMLElement;
  hudScore: HTMLElement;
}) {
  const { canvas, hudPlayer, hpFill, hudScore } = opts;

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 1.8));
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.imageProcessingConfiguration.exposure = 1.3;
  scene.imageProcessingConfiguration.contrast = 1.05;

  const camera = new UniversalCamera('camera', new Vector3(0, PLANET_RADIUS * 0.6, PLANET_RADIUS * 1.8), scene);
  camera.fov = (60 * Math.PI) / 180;
  camera.minZ = 0.1;
  camera.maxZ = 500;
  camera.speed = 0;
  camera.inertia = 0;
  scene.activeCamera = camera;

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.diffuse = new Color3(0.9, 0.9, 1);
  hemi.groundColor = new Color3(0.08, 0.06, 0.05);
  hemi.intensity = 0.7; // softer ambient to reduce washout
  const dir = new DirectionalLight('dir', new Vector3(-0.3, -1, -0.2), scene);
  dir.position = new Vector3(25, 40, 12);
  dir.intensity = 1.6; // lower key light to preserve color contrast
  dir.diffuse = new Color3(1, 0.95, 0.9);
  const rim = new DirectionalLight('rim', new Vector3(0.4, 0.2, 0.12), scene);
  rim.position = new Vector3(-20, -10, -5);
  rim.intensity = 0.4; // reduce rim so highlights don’t flatten colors

  const pipeline = new DefaultRenderingPipeline('default', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 1.15; // raise threshold so only very bright pixels bloom
  pipeline.bloomWeight = 0.08; // lighter bloom to avoid color bleed
  pipeline.bloomKernel = 24;
  pipeline.bloomScale = 0.3;

  const glow = new GlowLayer('glow', scene, { mainTextureSamples: 2 });
  glow.intensity = 0.25;

  const starCount = 1600;
  const starMesh = MeshBuilder.CreateSphere('star', { diameter: 0.6, segments: 2 }, scene);
  const starMat = new StandardMaterial('starMat', scene);
  starMat.disableLighting = true;
  starMat.emissiveColor = new Color3(0.55, 0.65, 0.9);
  starMat.alpha = 0.6;
  starMesh.material = starMat;
  starMesh.isPickable = false;
  const matrices = new Float32Array(starCount * 16);
  const tmp = new Matrix();
  for (let i = 0; i < starCount; i++) {
    const dirStar = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const dist = 220 + Math.random() * 80;
    const pos = dirStar.scale(dist);
    Matrix.TranslationToRef(pos.x, pos.y, pos.z, tmp);
    tmp.copyToArray(matrices, i * 16);
  }
  starMesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
  starMesh.alwaysSelectAsActiveMesh = true;
  starMesh.freezeNormals();

  const marsAlbedo = new Texture('/mars_albedo2.png', scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  marsAlbedo.wrapU = Texture.WRAP_ADDRESSMODE;
  marsAlbedo.wrapV = Texture.WRAP_ADDRESSMODE;
  const planetMat = new StandardMaterial('planetMat', scene);
  planetMat.diffuseTexture = marsAlbedo;
  planetMat.specularColor = new Color3(0.08, 0.06, 0.05);
  planetMat.emissiveColor = new Color3(0.48, 0.19, 0.12).scale(0.22);
  const planet = MeshBuilder.CreateSphere('planet', { diameter: PLANET_RADIUS * 2, segments: 96 }, scene);
  planet.material = planetMat;
  planet.receiveShadows = true;
  planet.isPickable = false;
  planet.freezeWorldMatrix();

  const tankMeshes = new Map<number, TransformNode>();
  const pickupMeshes = new Map<number, Mesh>();
  const fireMeshes = new Map<number, Mesh>();
  const renderStates = new Map<
    number,
    { pos: Vector3; targetPos: Vector3; heading: Vector3; targetHeading: Vector3; yaw: number; targetYaw: number }
  >();
  let playerId: number | null = null;
  let playerName = 'Pilot';
  let localState: SnapshotPlayer | null = null;
  let lastSnapshotTime = 0;
  let gotSnapshot = false;
  const camState = { eye: new Vector3(), look: new Vector3() };
  let camInitialized = false;
  let focusDir: Vector3 | null = null;
  const _tankPos = new Vector3();
  const _tankDir = new Vector3();
  const _focusTmp = new Vector3();
  const _lookTmp = new Vector3();
  const _upTmp = new Vector3();
  const _worldUp = new Vector3(0, 1, 0);
  const _fallbackZ = new Vector3(0, 0, 1);
  const _viewTmp = new Vector3();
  const _rightTmp = new Vector3();
  const _forwardTmp = new Vector3();
  const _matTmp = new Matrix();
  const _quatTmp = new Quaternion();
  let movement: TuningConfig = { ...DEFAULT_TUNING };
  let getInput: (() => Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'>) | null = null;

  const color3 = (hex: string) => Color3.FromHexString(hex);

  function setHUD(hp: number, score: number, nameLabel: string) {
    hudPlayer.textContent = nameLabel;
    hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    hudScore.textContent = String(score);
  }

  function createTankMesh(color: string) {
    const root = new TransformNode('tank', scene);
    root.rotationQuaternion = Quaternion.Identity();

    const bodyMat = new StandardMaterial(`body-${color}`, scene);
    bodyMat.diffuseColor = color3(color);
    bodyMat.specularColor = new Color3(0.04, 0.04, 0.04);
    bodyMat.specularPower = 16;

    const body = MeshBuilder.CreateBox('body', { width: 2.4, height: 1.1, depth: 3.2 }, scene);
    body.material = bodyMat;
    body.parent = root;
    body.position.y = 0.55;

    const turret = MeshBuilder.CreateCylinder('turret', { diameterTop: 0.5, diameterBottom: 0.6, height: 0.8, tessellation: 8 }, scene);
    turret.material = bodyMat;
    turret.parent = root;
    turret.position.set(0, 1.1, 0);

    const barrelMat = new StandardMaterial('barrelMat', scene);
    barrelMat.diffuseColor = new Color3(0.96, 0.88, 0.78);
    barrelMat.specularColor = new Color3(0.03, 0.03, 0.03);
    const barrel = MeshBuilder.CreateCylinder('barrel', { diameterTop: 0.18, diameterBottom: 0.25, height: 2.2, tessellation: 8 }, scene);
    barrel.material = barrelMat;
    barrel.parent = root;
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.2, 1.6);

    const stripMat = new StandardMaterial('stripMat', scene);
    stripMat.emissiveColor = new Color3(0.43, 0.9, 1);
    stripMat.diffuseColor = stripMat.emissiveColor;
    const strip = MeshBuilder.CreateBox('strip', { width: 0.15, height: 0.12, depth: 2.6 }, scene);
    strip.material = stripMat;
    strip.parent = root;
    strip.position.set(1.1, 0.75, 0);
    strip.isPickable = false;

    root.getChildMeshes().forEach((m) => (m.isPickable = false));
    return root;
  }

  function randomColor() {
    const palette = ['#ff6b6b', '#feca57', '#54a0ff', '#5f27cd', '#1dd1a1'];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  function stepLocal(dt: number) {
    if (!localState || !getInput) return;
    const input = getInput();
    const pos: Vec3 = { x: localState.pos[0], y: localState.pos[1], z: localState.pos[2] };
    const vel: Vec3 = { x: localState.vel[0], y: localState.vel[1], z: localState.vel[2] };
    let heading: Vec3 = { x: localState.heading[0], y: localState.heading[1], z: localState.heading[2] };
    const normal = v.norm(pos);

    const currentYawVel = localState.yawVel ?? 0;
    const targetYawVel = input.turn * movement.turnSpeed;
    const lerp = Math.min(1, movement.turnSmooth * dt);
    const nextYawVel = currentYawVel + (targetYawVel - currentYawVel) * lerp;
    localState.yawVel = nextYawVel;
    const dYaw = nextYawVel * dt;
    localState.yaw += dYaw;

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

    const vel2 = v.add(vel, v.scale(heading, input.thrust * movement.thrust * dt));
    const tangentVel = v.sub(vel2, v.scale(normal, v.dot(vel2, normal)));
    let finalVel = v.scale(tangentVel, Math.max(0, 1 - movement.drag * dt));
    const speed = v.len(finalVel);
    if (speed > movement.maxSpeed) finalVel = v.scale(finalVel, movement.maxSpeed / speed);
    const newPos = v.add(pos, v.scale(finalVel, dt));
    const newNormal = v.norm(newPos);
    const clamped = v.scale(newNormal, PLANET_RADIUS + HOVER);

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

  function updatePlanetCamera(dt: number, tankWorldPos: Vector3) {
    _tankPos.copyFrom(tankWorldPos);
    _tankDir.copyFrom(_tankPos);
    if (_tankDir.lengthSquared() < 1e-6) _tankDir.set(0, 1, 0);
    _tankDir.normalize();

    if (!focusDir || focusDir.lengthSquared() < 1e-6) {
      focusDir = _tankDir.clone();
    }

    const dot = Scalar.Clamp(Vector3.Dot(focusDir, _tankDir), -1, 1);
    const theta = Math.acos(dot);

    if (theta > CAM_INNER_ANGLE) {
      const t = Scalar.Clamp((theta - CAM_INNER_ANGLE) / (CAM_OUTER_ANGLE - CAM_INNER_ANGLE), 0, 1);
      const lerpFactor = t * CAM_FOLLOW_RATE * dt;
      focusDir = Vector3.Lerp(focusDir, _tankDir, lerpFactor).normalize();
    }

    const camRadius = PLANET_RADIUS + CAM_HEIGHT;
    const desiredEye = _focusTmp.copyFrom(focusDir).scale(camRadius);
    const lookTarget = _lookTmp.copyFrom(_tankPos);

    _viewTmp.copyFrom(lookTarget).subtractInPlace(desiredEye).normalize();

    _upTmp.copyFrom(_worldUp);
    let proj = Vector3.Dot(_viewTmp, _upTmp);
    _upTmp.addInPlace(_viewTmp.scale(-proj));

    if (_upTmp.lengthSquared() < 1e-6) {
      _upTmp.copyFrom(_fallbackZ);
      proj = Vector3.Dot(_viewTmp, _upTmp);
      _upTmp.addInPlace(_viewTmp.scale(-proj));
    }

    _upTmp.normalize();

    if (!camInitialized) {
      camState.eye.copyFrom(desiredEye);
      camState.look.copyFrom(lookTarget);
      camInitialized = true;
    } else {
      Vector3.LerpToRef(camState.eye, desiredEye, CAM_POS_LERP, camState.eye);
      Vector3.LerpToRef(camState.look, lookTarget, CAM_LOOK_LERP, camState.look);
    }

    camera.position.copyFrom(camState.eye);
    camera.upVector.copyFrom(_upTmp);
    camera.setTarget(camState.look);
  }

  function renderEntities(dt: number) {
    if (lastSnapshotTime > 0) {
      setHUD(localState?.hp ?? 0, localState?.score ?? 0, `${playerName} #${playerId ?? '--'}`);
    }

    const lerp = Math.min(1, 8 * dt);
    for (const [id, state] of renderStates) {
      const mesh = tankMeshes.get(id);
      if (!mesh) continue;
      Vector3.LerpToRef(state.pos, state.targetPos, lerp, state.pos);
      const shortest = Math.atan2(Math.sin(state.targetYaw - state.yaw), Math.cos(state.targetYaw - state.yaw));
      state.yaw = state.yaw + shortest * lerp;
      Vector3.LerpToRef(state.heading, state.targetHeading, lerp, state.heading);

      const normal = state.pos.lengthSquared() > 1e-6 ? state.pos.normalizeToNew() : new Vector3(0, 1, 0);
      if (state.heading.lengthSquared() < 1e-6) {
        const ref = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        state.heading.copyFrom(Vector3.Cross(normal, ref).normalize());
      } else {
        state.heading.normalize();
      }

      mesh.position.copyFrom(state.pos);
      const forward = state.heading;
      _rightTmp.copyFrom(Vector3.Cross(normal, forward));
      if (_rightTmp.lengthSquared() < 1e-6) {
        _rightTmp.copyFrom(Vector3.Cross(normal, _fallbackZ));
      }
      _rightTmp.normalize();
      _forwardTmp.copyFrom(Vector3.Cross(_rightTmp, normal)).normalize();
      Matrix.FromXYZAxesToRef(_rightTmp, normal, _forwardTmp, _matTmp);
      Quaternion.FromRotationMatrixToRef(_matTmp, _quatTmp);
      if (!mesh.rotationQuaternion) mesh.rotationQuaternion = new Quaternion();
      mesh.rotationQuaternion.copyFrom(_quatTmp);
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
          const velBlend = 0.2;
          localState.vel = [
            localState.vel[0] + (state.vel[0] - localState.vel[0]) * velBlend,
            localState.vel[1] + (state.vel[1] - localState.vel[1]) * velBlend,
            localState.vel[2] + (state.vel[2] - localState.vel[2]) * velBlend,
          ];
          const shortest = Math.atan2(Math.sin(state.yaw - localState.yaw), Math.cos(state.yaw - localState.yaw));
          localState.yaw = localState.yaw + shortest * 0.2;
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
      }
      mesh.setEnabled(state.alive);
      let r = renderStates.get(state.id);
      if (!r) {
        r = {
          pos: new Vector3(...state.pos),
          targetPos: new Vector3(...state.pos),
          heading: new Vector3(...state.heading),
          targetHeading: new Vector3(...state.heading),
          yaw: state.yaw,
          targetYaw: state.yaw,
        };
        renderStates.set(state.id, r);
      } else {
        r.targetPos.set(state.pos[0], state.pos[1], state.pos[2]);
        r.targetHeading.set(state.heading[0], state.heading[1], state.heading[2]);
        r.targetYaw = state.yaw;
      }
    }

    for (const mesh of pickupMeshes.values()) mesh.setEnabled(false);
    msg.pickups.forEach((p) => {
      let mesh = pickupMeshes.get(p.id);
      if (!mesh) {
        mesh = MeshBuilder.CreatePolyhedron(`pickup-${p.id}`, { type: 1, size: 0.7 }, scene);
        const mat = new StandardMaterial(`pickupMat-${p.id}`, scene);
        mat.emissiveColor = color3('#7effb3');
        mat.diffuseColor = mat.emissiveColor;
        mat.alpha = 0.9;
        mesh.material = mat;
        mesh.isPickable = false;
        pickupMeshes.set(p.id, mesh);
      }
      mesh.setEnabled(true);
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    });

    for (const f of fireMeshes.values()) f.setEnabled(false);
    msg.fire.forEach((f) => {
      let ring = fireMeshes.get(f.id);
      if (!ring) {
        ring = MeshBuilder.CreateTorus(`fire-${f.id}`, { diameter: f.radius * 2, thickness: 0.4, tessellation: 64 }, scene);
        const mat = new StandardMaterial(`fireMat-${f.id}`, scene);
        mat.emissiveColor = color3('#ff964f');
        mat.diffuseColor = mat.emissiveColor;
        mat.alpha = 0.7;
        ring.material = mat;
        ring.rotation.x = Math.PI / 2;
        ring.isPickable = false;
        ring.metadata = { baseDiameter: f.radius * 2 };
        fireMeshes.set(f.id, ring);
      }
      const meta = (ring.metadata as { baseDiameter?: number }) || {};
      if (!meta.baseDiameter) meta.baseDiameter = f.radius * 2;
      ring.metadata = meta;
      const scale = (f.radius * 2) / meta.baseDiameter;
      ring.scaling.set(scale, scale, scale);
      ring.setEnabled(true);
      ring.position.set(f.center[0], f.center[1], f.center[2]);
    });
  }

  function updateCameraTarget(dt: number) {
    const myMesh = playerId !== null ? tankMeshes.get(playerId) : undefined;
    if (myMesh) {
      updatePlanetCamera(dt, myMesh.getAbsolutePosition());
    } else {
      const cameraRadius = PLANET_RADIUS + CAM_HEIGHT;
      camera.position.set(0, cameraRadius, 0);
      camera.upVector.set(0, 0, 1);
      camera.setTarget(Vector3.Zero());
      camInitialized = false;
      focusDir = null;
    }
  }

  function update(dt: number, snapshot: SnapshotMessage | null) {
    if (snapshot) {
      handleSnapshot(snapshot);
    }
    stepLocal(dt);
    renderEntities(dt);
    updateCameraTarget(dt);
    scene.render();
  }

  const handleResize = () => engine.resize();
  window.addEventListener('resize', handleResize);

  return {
    update,
    dispose() {
      engine.stopRenderLoop();
      engine.dispose();
      window.removeEventListener('resize', handleResize);
    },
    setLocalPlayerId(id: number | null) {
      playerId = id;
    },
    setPlayerName(name: string) {
      playerName = name;
    },
    setMovement(next: TuningConfig) {
      movement = next;
    },
    setInputGetter(fn: () => Pick<InputState, 'thrust' | 'turn' | 'fire' | 'power'>) {
      getInput = fn;
    },
  };
}
