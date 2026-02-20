import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resetGameAction } from '@/app/actions';
import { CopyLinkButton } from '@/components/copy-link-button';
import { formatDateTime } from '@/lib/format';
import { getRunByShareCode } from '@/lib/run-service';

export default async function ResultsPage({
  params
}: {
  params: {
    shareCode: string;
  };
}) {
  const run = await getRunByShareCode(params.shareCode);

  if (!run) {
    notFound();
  }

  const headerStore = headers();
  const host = headerStore.get('host');
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const shareUrl = host ? `${protocol}://${host}/results/${run.shareCode}` : `/results/${run.shareCode}`;

  return (
    <div className="space-y-4">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-court-700">Final Team Score</p>
            <h1 className="text-4xl font-bold text-slate-900" data-testid="team-score">
              {run.teamScore.toFixed(1)}
            </h1>
            <p className="text-sm text-slate-600">Created {formatDateTime(run.createdAt)}</p>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <p>
              Share Code: <span className="font-semibold">{run.shareCode}</span>
            </p>
            {run.groupCode ? (
              <p>
                Group: <span className="font-semibold">{run.groupCode}</span>
              </p>
            ) : null}
            {run.seed ? (
              <p>
                Seed: <span className="font-semibold">{run.seed}</span>
              </p>
            ) : null}
            <CopyLinkButton url={shareUrl} />
          </div>
        </div>

        {run.usedFallbackStats ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Some players used fallback stats because no advanced stat entry exists in the MVP dataset.
          </p>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {run.picks.map((pick) => (
            <div key={pick.slot} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-court-700">{pick.slot}</p>
              <p className="text-sm font-semibold text-slate-900">{pick.playerName}</p>
              <p className="text-xs text-slate-600">{pick.teamAbbr}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Per-player contributions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">BPM</th>
                <th className="px-4 py-3">WS/48</th>
                <th className="px-4 py-3">VORP</th>
                <th className="px-4 py-3">EPM</th>
                <th className="px-4 py-3">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {run.picks.map((pick) => (
                <tr key={pick.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">{pick.slot}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {pick.playerName}
                    <span className="ml-1 text-xs text-slate-500">({pick.teamAbbr})</span>
                    {pick.usedFallback ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">
                        fallback
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{pick.bpm.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.ws48.toFixed(3)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.vorp.toFixed(1)}</td>
                  <td className="px-4 py-3 text-slate-700">{pick.epm.toFixed(1)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{pick.contribution.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <form action={resetGameAction}>
          <button type="submit" className="button-primary">
            Play again
          </button>
        </form>

        {run.groupCode ? (
          <Link href={`/leaderboard?groupCode=${encodeURIComponent(run.groupCode)}`} className="button-secondary">
            View group leaderboard
          </Link>
        ) : (
          <Link href="/leaderboard" className="button-secondary">
            View leaderboard
          </Link>
        )}
      </div>
    </div>
  );
}
