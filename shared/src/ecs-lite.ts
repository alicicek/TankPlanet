// shared/src/ecs-lite.ts
export type EntityId = number;

export interface ComponentStore<T> {
  data: Map<EntityId, T>;
}

export interface World {
  nextEntityId: number;
  entities: Set<EntityId>;
}

export function createWorld(): World {
  return {
    nextEntityId: 1,
    entities: new Set<EntityId>(),
  };
}

export function addEntity(world: World): EntityId {
  const id = world.nextEntityId++;
  world.entities.add(id);
  return id;
}

export function defineComponent<T>(initial?: () => T): ComponentStore<T> {
  return {
    data: new Map<EntityId, T>(),
  };
}

export function addComponent<T>(
  world: World,
  store: ComponentStore<T>,
  entity: EntityId,
  value: T,
): void {
  if (!world.entities.has(entity)) {
    throw new Error(`Cannot add component to unknown entity ${entity}`);
  }
  store.data.set(entity, value);
}

export function getComponent<T>(
  store: ComponentStore<T>,
  entity: EntityId,
): T | undefined {
  return store.data.get(entity);
}

export function setComponent<T>(
  store: ComponentStore<T>,
  entity: EntityId,
  value: T,
): void {
  store.data.set(entity, value);
}
