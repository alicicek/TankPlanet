import type {
  GameConfig,
  InputState,
  MatchInfo,
  PlayerId,
  PowerupType,
  SnapshotPlayer,
  TuningConfig,
  Vector3Tuple,
} from './types';

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
  match?: MatchInfo;
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

export interface RoundEndEventMessage {
  type: 'event';
  kind: 'roundEnd';
  winner: PlayerId | null; // null if tie or no winner
  round: number;
  scores: { playerId: PlayerId; score: number }[];
}

export type EventMessage =
  | KillEventMessage
  | RespawnEventMessage
  | PickupEventMessage
  | MeteorImpactPickupEvent
  | MeteorImpactFireEvent
  | RoundEndEventMessage;

export interface WelcomeMessage {
  type: 'welcome';
  playerId: PlayerId;
  match: MatchInfo;
  planet: GameConfig['planet'];
  tuning?: TuningConfig;
}

export type ServerMessage = SnapshotMessage | EventMessage | WelcomeMessage;

export type InputMessage = { type: 'input' } & InputState;

export interface JoinMessage {
  type: 'join';
  name: string;
}

export type ClientMessage = InputMessage | JoinMessage;
