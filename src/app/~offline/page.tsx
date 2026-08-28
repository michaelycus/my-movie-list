// Served by the service worker's document fallback (see src/app/sw.ts) when
// a navigation can't reach the network. Precached at build time, so it must
// stay static - no data fetching, nothing that only makes sense online.
export const metadata = {
  title: "You're offline - CineMood",
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:px-8">
      <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-6 text-muted-foreground">
        You&apos;re offline. Reconnect to browse the catalog, search, or start
        a session - anything already open should still work.
      </p>
    </main>
  );
}
