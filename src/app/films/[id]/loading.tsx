function SkeletonBlock({ className }: { className: string }) {
  return (
    <div className={`rounded bg-surface-2 motion-safe:animate-pulse ${className}`} />
  );
}

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <SkeletonBlock className="h-5 w-32 rounded-none" />
      <SkeletonBlock className="aspect-video w-full rounded-lg" />
      <div className="flex flex-col gap-6 sm:flex-row">
        <SkeletonBlock className="aspect-2/3 w-40 shrink-0 rounded-lg sm:w-56" />
        <div className="flex flex-1 flex-col gap-4">
          <SkeletonBlock className="h-8 w-2/3" />
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-20 w-full max-w-2xl" />
        </div>
      </div>
    </main>
  );
}
