export type PlayerId = number;

export type Vec3 = { x: number; y: number; z: number };
export type Vector3 = Vec3;
export type Quaternion = { x: number; y: number; z: number; w: number };
export type Vector3Tuple = [number, number, number];

export type WeaponType = 'blaster' | 'rocket' | 'shotgun';
export type PowerupType = 'rocket' | 'shotgun';

export interface InputState {
  seq: number;
  thrust: -1 | 0 | 1;
  turn: -1 | 0 | 1;
  fire: boolean;
  power: boolean;
  dt: number;
}

export type InputCommand = InputState;

export interface SnapshotPlayer {
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

export type RoundState = 'waiting' | 'active' | 'complete';
export type MatchState = 'idle' | 'active' | 'post';

export interface MatchInfo {
  state: MatchState;
  timeLeft: number;
  scoreCap: number;
  round: number;
  roundTime?: number;
}

export interface TuningConfig {
  maxSpeed: number;
  thrust: number;
  turnSpeed: number;
  turnSmooth?: number;
  drag: number;
}

export interface GameConfig {
  planet: { radius: number };
  match: MatchInfo;
  tuning: TuningConfig;
}
