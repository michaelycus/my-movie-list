import Link from "next/link";
import { navPillVariants } from "@/lib/ui";
import { buildSearchHref, type BrowseParams, type BrowseSort } from "@/lib/movies/browse";

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "popularity", label: "Popularity" },
  { value: "rating", label: "Rating" },
  { value: "release_date", label: "Release date" },
];

export function SortControl({ params }: { params: BrowseParams }) {
  return (
    <nav aria-label="Sort by" className="flex gap-2">
      {SORT_OPTIONS.map((option) => {
        const isActive = option.value === params.sort;
        return (
          <Link
            key={option.value}
            href={buildSearchHref(params, { sort: option.value, page: 1 })}
            aria-current={isActive ? "true" : undefined}
            className={navPillVariants({ state: isActive ? "active" : "inactive" })}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
