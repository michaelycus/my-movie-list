function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-2/3 rounded-lg bg-surface-2 motion-safe:animate-pulse" />
      <div className="h-4 w-3/4 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div className="h-3 w-1/4 rounded bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="h-8 w-32 rounded bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </main>
  );
}
