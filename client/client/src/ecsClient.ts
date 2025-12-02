// client/src/ecsClient.ts
import type { SnapshotPlayer } from '@shared';
import {
  createWorld,
  addEntity,
  defineComponent,
  addComponent,
  getComponent,
  setComponent,
  type World,
  type EntityId,
} from '@shared/ecs-lite';

// Define some basic component shapes for the client ECS
export interface TransformData {
  x: number;
  y: number;
  z: number;
}

export interface VelocityData {
  vx: number;
  vy: number;
  vz: number;
}

export interface TankData {
  hp: number;
  alive: boolean;
}

export interface InputData {
  thrust: number;
  turn: number;
  fire: boolean;
  power: boolean;
}

export const Transform = defineComponent<TransformData>();
export const Velocity = defineComponent<VelocityData>();
export const Tank = defineComponent<TankData>();
export const InputComp = defineComponent<InputData>();

export interface ClientEcs {
  world: World;
  tankEntity: EntityId;
}

export function createClientEcs(): ClientEcs {
  const world = createWorld();

  const tankEntity = addEntity(world);

  addComponent(world, Transform, tankEntity, { x: 0, y: 0, z: 0 });
  addComponent(world, Velocity, tankEntity, { vx: 0, vy: 0, vz: 0 });
  addComponent(world, Tank, tankEntity, { hp: 100, alive: true });
  addComponent(world, InputComp, tankEntity, {
    thrust: 0,
    turn: 0,
    fire: false,
    power: false,
  });

  return { world, tankEntity };
}

export function syncLocalStateToEcs(
  local: SnapshotPlayer | null,
  world: World,
  entity: EntityId,
) {
  if (!local) return;

  const currentTransform = getComponent(Transform, entity) ?? { x: 0, y: 0, z: 0 };
  const currentVelocity = getComponent(Velocity, entity) ?? { vx: 0, vy: 0, vz: 0 };

  setComponent(Transform, entity, {
    ...currentTransform,
    x: local.pos[0],
    y: local.pos[1],
    z: local.pos[2],
  });

  setComponent(Velocity, entity, {
    ...currentVelocity,
    vx: local.vel[0],
    vy: local.vel[1],
    vz: local.vel[2],
  });
}

export function syncInputToEcs(
  input: { thrust: number; turn: number; fire: boolean; power: boolean },
  world: World,
  entity: EntityId,
) {
  const current = getComponent(InputComp, entity) ?? {
    thrust: 0,
    turn: 0,
    fire: false,
    power: false,
  };

  setComponent(InputComp, entity, {
    ...current,
    thrust: input.thrust,
    turn: input.turn,
    fire: input.fire,
    power: input.power,
  });
}
