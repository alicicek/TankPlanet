import { createWorld, type World } from 'bitecs';

export type GameWorld = World;

export function createGameWorld(): GameWorld {
  return createWorld();
}
