import { defineComponent, Types } from 'bitecs';

export const Transform = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
  rx: Types.f32,
  ry: Types.f32,
  rz: Types.f32,
});

export const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
});

export const Tank = defineComponent({
  playerId: Types.ui32,
  hp: Types.f32,
  score: Types.i32,
  alive: Types.ui8,
});

export const InputState = defineComponent({
  seq: Types.ui32,
  thrust: Types.i8,
  turn: Types.i8,
  fire: Types.ui8,
  power: Types.ui8,
  dt: Types.f32,
});
