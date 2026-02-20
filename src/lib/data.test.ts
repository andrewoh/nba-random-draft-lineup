import { describe, expect, it } from 'vitest';
import { lookupPlayerStats } from '@/lib/data';

describe('multi-season stat lookup', () => {
  it('projects latest target season using available historical seasons', () => {
    const lookup = lookupPlayerStats('Luka Doncic', '2026-27');

    expect(lookup.usedFallback).toBe(false);
    expect(lookup.seasonsUsed.length).toBeGreaterThan(0);
    expect(lookup.projectedFromSeasons).toBeGreaterThan(0);
  });

  it('projects positional baseline when no history exists for a player', () => {
    const lookup = lookupPlayerStats('Definitely Unknown Player', '2026-27');

    expect(lookup.usedFallback).toBe(true);
    expect(lookup.seasonsUsed).toEqual(['POS_PROJECTION']);
  });
});
