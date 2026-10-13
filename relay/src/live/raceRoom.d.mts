/** Types for raceRoom.mjs, for the relay's tests. */
import type { RacePuzzle, RaceResult } from './duelRules.mjs';
import type { GroupKindModule } from './group.mjs';

export interface RaceProgress {
  index: number;
  solved: number;
  strikes: number;
  done: boolean;
}

export interface Racer {
  id: string;
  name: string;
  rating: number | null;
}

export interface RaceRound {
  round: number;
  results: Record<string, RaceResult>;
  points: Record<string, number>;
}

export interface Race {
  number: number;
  format: 'rounds' | 'timed';
  level: number;
  status: 'playing' | 'over';
  racers: Racer[];
  items: RacePuzzle[];
  round: number;
  phase: 'countdown' | 'live' | 'reveal' | null;
  phaseEndsAt: number | null;
  liveSince: number | null;
  results: Record<string, RaceResult>;
  rounds: RaceRound[];
  scores: Record<string, number>;
  progress: Record<string, RaceProgress> | null;
  places: { id: string; place: number }[] | null;
  endedAt: number | null;
}

export interface RaceRoomState {
  opts: { format: 'rounds' | 'timed'; level: number };
  count: number;
  race: Race | null;
}

export function racePoints(results: Record<string, RaceResult>): Record<string, number>;
export function racePlaces(race: Race): { id: string; place: number }[];
export const raceRoom: GroupKindModule<RaceRoomState>;
