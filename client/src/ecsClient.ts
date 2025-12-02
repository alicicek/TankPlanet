// client/src/ecsClient.ts
import type { SnapshotPlayer } from '@shared';

export type EntityId = number;

export interface GameWorld {
  // keep this simple for now; we’ll flesh it out later
  entities: Set<EntityId>;
}

export interface ClientEcs {
  world: GameWorld;
  tankEntity: EntityId;
}

export function createClientEcs(): ClientEcs {
  const world: GameWorld = { entities: new Set<EntityId>() };
  const tankEntity: EntityId = 1;
  world.entities.add(tankEntity);
  return { world, tankEntity };
}

export function syncLocalStateToEcs(
  _local: SnapshotPlayer | null,
  _world: GameWorld,
  _entity: EntityId,
): void {
  // no-op for now – will be implemented later
}

export function syncInputToEcs(
  _input: { thrust: number; turn: number; fire: boolean; power: boolean },
  _world: GameWorld,
  _entity: EntityId,
): void {
  // no-op for now – will be implemented later
}
