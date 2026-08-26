import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BrowseSort } from "@/lib/movies/browse";

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "popularity", label: "Popularity" },
  { value: "rating", label: "Rating" },
  { value: "release_date", label: "Release date" },
];

export function SortControl({ sort }: { sort: BrowseSort }) {
  return (
    <nav aria-label="Sort by" className="flex gap-2">
      {SORT_OPTIONS.map((option) => {
        const isActive = option.value === sort;
        return (
          <Link
            key={option.value}
            href={`/?sort=${option.value}`}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              isActive
                ? "border-neon-cyan text-neon-cyan"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
