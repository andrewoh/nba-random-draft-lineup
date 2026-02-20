import { describe, expect, it } from 'vitest';
import { applyPickToLineup, getOpenSlots, validatePick } from '@/lib/rules';
import type { LineupState } from '@/lib/types';

describe('slot locking rules', () => {
  it('locks a slot once filled', () => {
    const startingLineup: LineupState = {
      PG: {
        slot: 'PG',
        playerName: 'Player A',
        teamAbbr: 'AAA',
        teamName: 'Alpha'
      }
    };

    const validation = validatePick({
      lineup: startingLineup,
      slot: 'PG',
      playerName: 'Player B',
      currentTeamRoster: ['Player B'],
      chosenPlayers: []
    });

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.message).toContain('already locked');
    }
  });

  it('applies a pick to an open slot and reduces open slots', () => {
    const startingLineup: LineupState = {};

    const updated = applyPickToLineup(startingLineup, {
      slot: 'SF',
      playerName: 'Player C',
      teamAbbr: 'CCC',
      teamName: 'Gamma'
    });

    expect(updated.SF?.playerName).toBe('Player C');
    expect(getOpenSlots(updated)).not.toContain('SF');
  });

  it('rejects duplicate player selection', () => {
    const validation = validatePick({
      lineup: {},
      slot: 'SG',
      playerName: 'Player D',
      currentTeamRoster: ['Player D'],
      chosenPlayers: ['Player D']
    });

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.message).toContain('already been selected');
    }
  });
});
