import type {
  GameConfig,
  InputCommand,
  MatchInfo,
  PlayerId,
  PowerupType,
  TuningConfig,
  Vector3Tuple,
} from './types';

export interface SnapshotPlayer {
  id: PlayerId;
  pos: Vector3Tuple;
  vel: Vector3Tuple;
  heading: Vector3Tuple;
  yaw: number;
  yawVel?: number;
  hp: number;
  score: number;
  alive: boolean;
}

export interface MeteorSnapshot {
  id: number;
  pos: Vector3Tuple;
  target: Vector3Tuple;
}

export interface PickupSnapshot {
  id: number;
  pos: Vector3Tuple;
  payload: PowerupType;
}

export interface FireZoneSnapshot {
  id: number;
  center: Vector3Tuple;
  radius: number;
  ttl: number;
}

export interface SnapshotMessage {
  type: 'snap';
  time: number;
  players: SnapshotPlayer[];
  meteors: MeteorSnapshot[];
  pickups: PickupSnapshot[];
  fire: FireZoneSnapshot[];
}

export interface KillEventMessage {
  type: 'event';
  kind: 'kill';
  killer: PlayerId;
  victim: PlayerId;
}

export interface RespawnEventMessage {
  type: 'event';
  kind: 'respawn';
  player: PlayerId;
}

export interface PickupEventMessage {
  type: 'event';
  kind: 'pickup';
  player: PlayerId;
  payload: PowerupType;
}

export interface MeteorImpactPickupEvent {
  type: 'event';
  kind: 'meteorImpact';
  id: number;
  result: 'pickup';
  payload: PowerupType;
}

export interface MeteorImpactFireEvent {
  type: 'event';
  kind: 'meteorImpact';
  id: number;
  result: 'fire';
  fire: FireZoneSnapshot;
}

export type EventMessage =
  | KillEventMessage
  | RespawnEventMessage
  | PickupEventMessage
  | MeteorImpactPickupEvent
  | MeteorImpactFireEvent;

export interface WelcomeMessage {
  type: 'welcome';
  playerId: PlayerId;
  match: MatchInfo;
  planet: GameConfig['planet'];
  tuning?: TuningConfig;
}

export type ServerMessage = SnapshotMessage | EventMessage | WelcomeMessage;

export interface InputMessage extends InputCommand {
  type: 'input';
}

export interface JoinMessage {
  type: 'join';
  name?: string;
  color?: string;
}

export type ClientMessage = InputMessage | JoinMessage;
