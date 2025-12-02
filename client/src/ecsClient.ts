// client/src/ecsClient.ts
import { addComponent, addEntity } from 'bitecs';
import type { SnapshotPlayer } from '@shared';
import { createGameWorld, type GameWorld } from '@shared/game-core/world';
import { Transform, Velocity, Tank, InputState } from '@shared/game-core/components';

export function createClientEcs() {
  // Create a proper bitecs world via the shared factory.
  const world: GameWorld = createGameWorld();

  // For debugging – remove later if you want
  // console.log('ECS world at startup:', world);

  const tankEntity = addEntity(world);
  addComponent(world, Transform, tankEntity);
  addComponent(world, Velocity, tankEntity);
  addComponent(world, Tank, tankEntity);
  addComponent(world, InputState, tankEntity);

  return { world, tankEntity };
}

// Optional helpers; adjust field names to match your components.ts
export function syncLocalStateToEcs(
  local: SnapshotPlayer | null,
  world: GameWorld,
  entity: number,
) {
  if (!local) return;

  Transform.x[entity] = local.pos[0];
  Transform.y[entity] = local.pos[1];
  Transform.z[entity] = local.pos[2];

  Velocity.x[entity] = local.vel[0];
  Velocity.y[entity] = local.vel[1];
  Velocity.z[entity] = local.vel[2];
}

export function syncInputToEcs(
  input: { thrust: number; turn: number; fire: boolean; power: boolean },
  world: GameWorld,
  entity: number,
) {
  InputState.thrust[entity] = input.thrust;
  InputState.turn[entity] = input.turn;
  InputState.fire[entity] = input.fire ? 1 : 0;
  InputState.power[entity] = input.power ? 1 : 0;
}
