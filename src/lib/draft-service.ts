import type { Prisma } from '@prisma/client';
import { TOTAL_DRAWS } from '@/lib/constants';
import { getRosterByTeam, getTeamByAbbr } from '@/lib/data';
import { db } from '@/lib/db';
import { buildDrawSequence } from '@/lib/draw';
import { getOpenSlots, validatePick, applyPickToLineup } from '@/lib/rules';
import { scoreLineup } from '@/lib/scoring';
import { safeParseJson, toJsonString } from '@/lib/serialization';
import { generateShareCode, normalizeGroupCode, normalizeSeed } from '@/lib/share-code';
import { DRAFT_STATUSES, LINEUP_SLOTS } from '@/lib/types';
import type { DraftStatus, LineupPick, LineupSlot, LineupState } from '@/lib/types';

function makeCookieToken(): string {
  return crypto.randomUUID();
}

async function generateUniqueShareCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateShareCode();
    const existing = await tx.run.findUnique({ where: { shareCode: code }, select: { id: true } });
    if (!existing) {
      return code;
    }
  }

  throw new Error('Could not generate a unique share code.');
}

function parseLineup(lineupJson: string): LineupState {
  return safeParseJson<LineupState>(lineupJson, {});
}

function parseChosenPlayers(chosenPlayersJson: string): string[] {
  return safeParseJson<string[]>(chosenPlayersJson, []);
}

function parseDrawSequence(drawSequenceJson: string): string[] {
  return safeParseJson<string[]>(drawSequenceJson, []);
}

function computeRemainingTeams(drawSequence: string[], currentDrawIndex: number): string[] {
  return drawSequence.slice(currentDrawIndex);
}

function parseDraftStatus(status: string): DraftStatus {
  if (DRAFT_STATUSES.includes(status as DraftStatus)) {
    return status as DraftStatus;
  }

  return 'DRAFTING';
}

export async function createDraftSession(input: {
  groupCode?: string | null;
  seed?: string | null;
}) {
  const groupCode = normalizeGroupCode(input.groupCode);
  const seed = normalizeSeed(input.seed);
  const drawSequence = buildDrawSequence(seed);
  const cookieToken = makeCookieToken();

  return db.draftSession.create({
    data: {
      cookieToken,
      groupCode,
      seed,
      drawSequenceJson: toJsonString(drawSequence),
      remainingTeamsJson: toJsonString(drawSequence),
      currentDrawIndex: 0,
      lineupJson: toJsonString({}),
      chosenPlayersJson: toJsonString([]),
      status: 'DRAFTING'
    }
  });
}

export type DraftView = {
  id: string;
  cookieToken: string;
  status: DraftStatus;
  groupCode: string | null;
  seed: string | null;
  drawSequence: string[];
  currentDrawIndex: number;
  currentTeamAbbr: string | null;
  remainingTeams: string[];
  lineup: LineupState;
  chosenPlayers: string[];
  runShareCode: string | null;
};

export async function getDraftViewByCookieToken(cookieToken: string): Promise<DraftView | null> {
  const session = await db.draftSession.findUnique({
    where: { cookieToken },
    include: {
      run: {
        select: {
          shareCode: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  const drawSequence = parseDrawSequence(session.drawSequenceJson);
  const remainingTeams = safeParseJson<string[]>(
    session.remainingTeamsJson,
    computeRemainingTeams(drawSequence, session.currentDrawIndex)
  );

  return {
    id: session.id,
    cookieToken: session.cookieToken,
    status: parseDraftStatus(session.status),
    groupCode: session.groupCode,
    seed: session.seed,
    drawSequence,
    currentDrawIndex: session.currentDrawIndex,
    currentTeamAbbr: drawSequence[session.currentDrawIndex] ?? null,
    remainingTeams,
    lineup: parseLineup(session.lineupJson),
    chosenPlayers: parseChosenPlayers(session.chosenPlayersJson),
    runShareCode: session.run?.shareCode ?? null
  };
}

export async function submitDraftPick(input: {
  cookieToken: string;
  playerName: string;
  slot: LineupSlot;
}): Promise<{ completed: boolean; shareCode?: string }> {
  const { cookieToken, playerName, slot } = input;

  return db.$transaction(async (tx) => {
    const session = await tx.draftSession.findUnique({
      where: { cookieToken },
      include: {
        run: {
          select: {
            shareCode: true
          }
        }
      }
    });

    if (!session) {
      throw new Error('Draft session not found. Start a new game.');
    }

    if (session.status === 'COMPLETED') {
      return {
        completed: true,
        shareCode: session.run?.shareCode
      };
    }

    const drawSequence = parseDrawSequence(session.drawSequenceJson);
    const lineup = parseLineup(session.lineupJson);
    const chosenPlayers = parseChosenPlayers(session.chosenPlayersJson);

    if (session.currentDrawIndex >= TOTAL_DRAWS || session.currentDrawIndex >= drawSequence.length) {
      throw new Error('The round is already complete.');
    }

    const currentTeamAbbr = drawSequence[session.currentDrawIndex];
    const currentTeam = getTeamByAbbr(currentTeamAbbr);

    if (!currentTeam) {
      throw new Error('Current team is invalid. Start a new game.');
    }

    const validation = validatePick({
      lineup,
      slot,
      playerName,
      currentTeamRoster: getRosterByTeam(currentTeamAbbr),
      chosenPlayers
    });

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const updatedLineup = applyPickToLineup(lineup, {
      slot,
      playerName,
      teamAbbr: currentTeamAbbr,
      teamName: currentTeam.name
    });

    const updatedChosenPlayers = [...chosenPlayers, playerName];
    const nextDrawIndex = session.currentDrawIndex + 1;
    const roundIsComplete = nextDrawIndex >= TOTAL_DRAWS || getOpenSlots(updatedLineup).length === 0;

    if (!roundIsComplete) {
      const remainingTeams = computeRemainingTeams(drawSequence, nextDrawIndex);
      await tx.draftSession.update({
        where: { id: session.id },
        data: {
          currentDrawIndex: nextDrawIndex,
          remainingTeamsJson: toJsonString(remainingTeams),
          lineupJson: toJsonString(updatedLineup),
          chosenPlayersJson: toJsonString(updatedChosenPlayers)
        }
      });

      return {
        completed: false
      };
    }

    const orderedPicks = LINEUP_SLOTS.map((lineupSlot) => updatedLineup[lineupSlot]).filter(
      (pick): pick is LineupPick => Boolean(pick)
    );

    if (orderedPicks.length !== LINEUP_SLOTS.length) {
      throw new Error('Round cannot finish until all slots are filled.');
    }

    const scoring = scoreLineup(orderedPicks);
    const shareCode = await generateUniqueShareCode(tx);

    const run = await tx.run.create({
      data: {
        shareCode,
        groupCode: session.groupCode,
        seed: session.seed,
        teamScore: scoring.teamScore,
        usedFallbackStats: scoring.usedFallbackStats,
        lineupJson: toJsonString(updatedLineup),
        contributionsJson: toJsonString(scoring.playerScores),
        picks: {
          create: scoring.playerScores.map((playerScore) => ({
            slot: playerScore.pick.slot,
            playerName: playerScore.pick.playerName,
            teamAbbr: playerScore.pick.teamAbbr,
            teamName: playerScore.pick.teamName,
            bpm: playerScore.stats.bpm,
            ws48: playerScore.stats.ws48,
            vorp: playerScore.stats.vorp,
            epm: playerScore.stats.epm,
            usedFallback: playerScore.usedFallback,
            contribution: playerScore.contribution
          }))
        }
      }
    });

    await tx.draftSession.update({
      where: { id: session.id },
      data: {
        currentDrawIndex: nextDrawIndex,
        remainingTeamsJson: toJsonString([]),
        lineupJson: toJsonString(updatedLineup),
        chosenPlayersJson: toJsonString(updatedChosenPlayers),
        status: 'COMPLETED',
        runId: run.id
      }
    });

    return {
      completed: true,
      shareCode: run.shareCode
    };
  });
}
