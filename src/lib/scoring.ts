import { DEFAULT_SEASON } from '@/lib/constants';
import { lookupPlayerStats } from '@/lib/data';
import type { LineupPick, PlayerScoreBreakdown, PlayerStats } from '@/lib/types';

const METRIC_WEIGHTS = {
  // Highest impact two-way metric, gives broad value signal.
  bpm: 0.35,
  // Per-possession win impact metric.
  ws48: 0.3,
  // Cumulative value metric.
  vorp: 0.2,
  // External impact proxy.
  epm: 0.15
} as const;

const METRIC_RANGES: Record<keyof PlayerStats, { min: number; max: number }> = {
  bpm: { min: -8, max: 12 },
  ws48: { min: -0.05, max: 0.35 },
  vorp: { min: -1, max: 8 },
  epm: { min: -6, max: 8 }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMetric(metric: keyof PlayerStats, value: number): number {
  const { min, max } = METRIC_RANGES[metric];
  if (max === min) {
    return 50;
  }

  const normalized = ((value - min) / (max - min)) * 100;
  return clamp(normalized, 0, 100);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scorePlayer(stats: PlayerStats): {
  normalizedMetrics: PlayerStats;
  contribution: number;
} {
  const normalizedMetrics: PlayerStats = {
    bpm: normalizeMetric('bpm', stats.bpm),
    ws48: normalizeMetric('ws48', stats.ws48),
    vorp: normalizeMetric('vorp', stats.vorp),
    epm: normalizeMetric('epm', stats.epm)
  };

  const contribution =
    normalizedMetrics.bpm * METRIC_WEIGHTS.bpm +
    normalizedMetrics.ws48 * METRIC_WEIGHTS.ws48 +
    normalizedMetrics.vorp * METRIC_WEIGHTS.vorp +
    normalizedMetrics.epm * METRIC_WEIGHTS.epm;

  return {
    normalizedMetrics,
    contribution: roundToOneDecimal(contribution)
  };
}

export function scoreLineup(picks: LineupPick[], season = DEFAULT_SEASON): {
  teamScore: number;
  playerScores: PlayerScoreBreakdown[];
  usedFallbackStats: boolean;
} {
  if (picks.length === 0) {
    return {
      teamScore: 0,
      playerScores: [],
      usedFallbackStats: false
    };
  }

  const playerScores = picks.map((pick) => {
    const statsLookup = lookupPlayerStats(pick.playerName, season);
    const scoredPlayer = scorePlayer(statsLookup.stats);

    return {
      pick,
      stats: statsLookup.stats,
      usedFallback: statsLookup.usedFallback,
      normalizedMetrics: scoredPlayer.normalizedMetrics,
      contribution: scoredPlayer.contribution
    };
  });

  const totalContribution = playerScores.reduce((sum, player) => sum + player.contribution, 0);
  const teamScore = roundToOneDecimal(totalContribution / playerScores.length);

  return {
    teamScore,
    playerScores,
    usedFallbackStats: playerScores.some((player) => player.usedFallback)
  };
}

export const SCORING_CONFIG = {
  metricWeights: METRIC_WEIGHTS,
  metricRanges: METRIC_RANGES
};
