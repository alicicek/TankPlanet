import type { TuningConfig } from './types';

export const PLANET_RADIUS = 30;
export const HOVER = 0.6;
export const TUNING: Required<TuningConfig> = {
  maxSpeed: 60,
  thrust: 90,
  turnSpeed: 2.5,
  turnSmooth: 12,
  drag: 4,
};
