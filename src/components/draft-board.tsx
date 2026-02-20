'use client';

import { useMemo, useState } from 'react';
import { submitPickAction } from '@/app/actions';
import { SubmitButton } from '@/components/submit-button';
import { TOTAL_DRAWS } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { LINEUP_SLOTS } from '@/lib/types';
import type { LineupSlot, LineupState, Team } from '@/lib/types';

type DraftBoardProps = {
  currentTeam: Team;
  roster: string[];
  lineup: LineupState;
  currentDrawIndex: number;
  groupCode: string | null;
  seed: string | null;
  errorMessage: string | null;
};

export function DraftBoard({
  currentTeam,
  roster,
  lineup,
  currentDrawIndex,
  groupCode,
  seed,
  errorMessage
}: DraftBoardProps) {
  const [search, setSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<LineupSlot | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const filteredRoster = useMemo(
    () =>
      roster.filter((playerName) =>
        playerName.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [roster, search]
  );

  const openSlots = LINEUP_SLOTS.filter((slot) => !lineup[slot]);
  const lineupComplete = openSlots.length === 0;
  const progressPercent = ((currentDrawIndex + 1) / TOTAL_DRAWS) * 100;
  const canConfirm = Boolean(
    selectedPlayer && selectedSlot && openSlots.includes(selectedSlot)
  );

  return (
    <>
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-court-700">Current Team</p>
            <p className="text-xl font-bold text-slate-900">{currentTeam.name}</p>
            <p className="text-sm text-slate-600" data-testid="draw-progress">
              Draw {currentDrawIndex + 1}/{TOTAL_DRAWS}
            </p>
          </div>
          <div className="text-sm text-slate-600">
            {groupCode ? <p>Group: {groupCode}</p> : null}
            {seed ? <p>Seed: {seed}</p> : <p>Seed: random</p>}
          </div>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-court-700" style={{ width: `${progressPercent}%` }} />
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Roster</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search players"
              className="input max-w-48"
              data-testid="roster-search"
            />
          </div>

          {filteredRoster.length === 0 ? (
            <p className="text-sm text-slate-500">No players match your search.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {filteredRoster.map((playerName, index) => {
                const isSelected = selectedPlayer === playerName;
                return (
                  <li key={playerName}>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayer(playerName)}
                      disabled={lineupComplete}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                        isSelected
                          ? 'border-court-700 bg-court-50 text-court-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        lineupComplete && 'cursor-not-allowed opacity-50'
                      )}
                      data-testid={`player-option-${index}`}
                    >
                      {playerName}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-slate-900">Lineup Slots</h2>
          <p className="mt-1 text-sm text-slate-600">Choose one open slot. Filled slots are locked.</p>

          <div className="mt-4 space-y-2">
            {LINEUP_SLOTS.map((slot) => {
              const pick = lineup[slot];
              const isSelected = selectedSlot === slot;
              const isOpen = !pick;

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => isOpen && setSelectedSlot(slot)}
                  disabled={!isOpen}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left',
                    isOpen
                      ? isSelected
                        ? 'border-court-700 bg-court-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500'
                  )}
                  data-testid={`slot-${slot}`}
                >
                  <span className="font-semibold text-slate-900">{slot}</span>
                  <span className="truncate text-xs sm:text-sm">
                    {pick ? `${pick.playerName} (${pick.teamAbbr})` : 'Open'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p>Selected player: {selectedPlayer ?? 'None'}</p>
            <p>Selected slot: {selectedSlot ?? 'None'}</p>
          </div>

          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            disabled={!canConfirm}
            className="button-primary mt-4 w-full"
            data-testid="confirm-assignment"
          >
            Confirm assignment
          </button>
        </section>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-slate-900">Confirm Pick</h3>
            <p className="mt-2 text-sm text-slate-600">
              Assign <span className="font-semibold">{selectedPlayer}</span> to{' '}
              <span className="font-semibold">{selectedSlot}</span>?
            </p>

            <form action={submitPickAction} className="mt-4 space-y-2">
              <input type="hidden" name="playerName" value={selectedPlayer ?? ''} />
              <input type="hidden" name="slot" value={selectedSlot ?? ''} />
              <SubmitButton
                label="Yes, lock it in"
                pendingLabel="Locking..."
                className="button-primary w-full"
                testId="confirm-submit"
              />
            </form>

            <button
              type="button"
              onClick={() => setIsConfirmOpen(false)}
              className="button-secondary mt-2 w-full"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
