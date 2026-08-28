import type { BrowseParams } from "@/lib/movies/browse";
import { buttonVariants } from "@/lib/ui";

// A plain GET form, not a controlled input - matches the rest of the catalog's
// zero-client-JS navigation. Other active params ride along as hidden inputs
// so submitting a new text search doesn't drop the current filters; page
// resets (no hidden input for it), same as a sort or filter change.
export function SearchBar({ params }: { params: BrowseParams }) {
  return (
    <form method="get" action="/" role="search" className="flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={params.q ?? ""}
        placeholder="Search by title, actor, or director"
        aria-label="Search by title, actor, or director"
        className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
      />
      {params.sort !== "popularity" && (
        <input type="hidden" name="sort" value={params.sort} />
      )}
      {params.genreIds.map((id) => (
        <input key={id} type="hidden" name="genre" value={id} />
      ))}
      {params.decade !== null && (
        <input type="hidden" name="decade" value={params.decade} />
      )}
      {params.runtimeBand !== null && (
        <input type="hidden" name="runtime" value={params.runtimeBand} />
      )}
      {params.maxAge !== null && (
        <input type="hidden" name="age" value={params.maxAge} />
      )}
      <button type="submit" className={buttonVariants({ intent: "secondary" })}>
        Search
      </button>
    </form>
  );
}
