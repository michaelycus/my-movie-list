import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUsageStats, formatSpendUsd } from "@/lib/admin/stats";
import type { UsageStats } from "@/types/admin";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w92";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3">
      <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SignupsStrip({ signupsByDay }: { signupsByDay: UsageStats["signupsByDay"] }) {
  const max = Math.max(1, ...signupsByDay.map((day) => day.count));

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Signups, last 14 days</h2>
      <div className="flex h-20 items-end gap-1">
        {signupsByDay.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1" title={`${day.date}: ${day.count}`}>
            <div
              className="w-full rounded-t bg-neon-cyan/70 transition-[height] duration-300 ease-in-out-strong"
              style={{ height: `${(day.count / max) * 100}%`, minHeight: day.count > 0 ? "2px" : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{signupsByDay[0]?.date}</span>
        <span>{signupsByDay[signupsByDay.length - 1]?.date}</span>
      </div>
    </section>
  );
}

function SearchVolume({ searchVolume }: { searchVolume: UsageStats["searchVolume"] }) {
  const total = searchVolume.anonymous + searchVolume.authenticated;
  const anonPercent = total > 0 ? (searchVolume.anonymous / total) * 100 : 0;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Search volume</h2>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-neon-cyan transition-[width] duration-300 ease-in-out-strong"
          style={{ width: `${anonPercent}%` }}
        />
        <div
          className="h-full bg-neon-magenta transition-[width] duration-300 ease-in-out-strong"
          style={{ width: `${100 - anonPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Anonymous: {searchVolume.anonymous}</span>
        <span>Signed in: {searchVolume.authenticated}</span>
      </div>
    </section>
  );
}

function MostChosenFilms({ films }: { films: UsageStats["mostChosenFilms"] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-foreground">Most-chosen films</h2>
      {films.length === 0 ? (
        <p className="text-sm text-muted-foreground">No films chosen yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {films.map((film) => (
            <li key={film.movieId} className="flex items-center gap-3">
              <div className="relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded bg-surface-2">
                {film.posterPath && (
                  <Image src={`${POSTER_BASE_URL}${film.posterPath}`} alt="" fill unoptimized sizes="32px" className="object-cover" />
                )}
              </div>
              <span className="flex-1 truncate text-sm text-foreground">{film.title}</span>
              <span className="text-sm text-neon-lime">{film.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  // getClaims(), not getUser(): matches every other protected route's
  // pattern (src/proxy.ts already verified there's a session for /admin).
  const { data } = await supabase.auth.getClaims();
  const ownerId = data?.claims?.sub;
  if (typeof ownerId !== "string") notFound();

  // The self-read policy on profiles (id = auth.uid()) covers this - no
  // admin-only policy needed just to check your own role.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile role for /admin", error);
    notFound();
  }

  // notFound(), not a redirect: a non-admin poking at this route shouldn't
  // get confirmation the route exists, matching /sessions/[id]'s existing
  // convention for missing/wrong-owner access.
  if (profile?.role !== "admin") notFound();

  let stats: UsageStats | null = null;
  try {
    stats = await getUsageStats(supabase);
  } catch (statsError) {
    console.error("Failed to load usage stats for /admin", statsError);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Admin</h1>

      {!stats ? (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-center text-muted-foreground">
          Couldn&apos;t load usage stats right now. Try refreshing the page.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Signups (14d)"
              value={String(stats.signupsByDay.reduce((sum, day) => sum + day.count, 0))}
            />
            <StatTile label="Sessions created" value={String(stats.sessionsCreatedCount)} />
            <StatTile label="Searches" value={String(stats.searchVolume.anonymous + stats.searchVolume.authenticated)} />
            <StatTile label="Est. API spend" value={formatSpendUsd(stats.estimatedSpendUsd)} />
          </div>

          <SignupsStrip signupsByDay={stats.signupsByDay} />
          <SearchVolume searchVolume={stats.searchVolume} />
          <MostChosenFilms films={stats.mostChosenFilms} />

          <p className="text-xs text-muted-foreground">
            {stats.embeddingCallCount} embedding calls, {stats.llmCallCount} LLM calls. Estimated spend is a rough
            figure from documented per-call cost assumptions, not measured billing.
          </p>
        </>
      )}
    </main>
  );
}
