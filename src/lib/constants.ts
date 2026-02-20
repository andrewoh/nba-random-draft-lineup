import type { PlayerStats } from '@/lib/types';

export const DEFAULT_SEASON = '2024-25';
export const TOTAL_DRAWS = 5;
export const GROUP_CODE_MAX_LENGTH = 16;
export const SEED_MAX_LENGTH = 64;
export const SHARE_CODE_LENGTH = 6;

export const FALLBACK_PLAYER_STATS: PlayerStats = {
  bpm: 0,
  ws48: 0.1,
  vorp: 0.5,
  epm: 0
};

export const DRAFT_SESSION_COOKIE = 'nba_draft_session';
