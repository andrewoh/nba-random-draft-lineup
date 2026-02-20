import { z } from 'zod';
import { LINEUP_SLOTS } from '@/lib/types';

export const startGameSchema = z.object({
  groupCode: z.string().max(64).optional(),
  seed: z.string().max(128).optional()
});

export const draftPickSchema = z.object({
  playerName: z.string().min(1).max(80),
  slot: z.enum(LINEUP_SLOTS)
});
