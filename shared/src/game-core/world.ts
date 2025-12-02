// shared/src/game-core/world.ts
import { createWorld } from 'bitecs';

// You can add a proper type later; for now, keep it simple.
export type GameWorld = ReturnType<typeof createWorld>;

export function createGameWorld(): GameWorld {
  // Create and return a fresh ECS world instance.
  const world = createWorld();
  return world;
}
