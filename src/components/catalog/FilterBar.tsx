import Link from "next/link";
import {
  buildSearchHref,
  clearFiltersHref,
  hasActiveFilters,
  type AgeCeiling,
  type BrowseParams,
  type RuntimeBand,
} from "@/lib/movies/browse";
import { formatAgeCertification } from "@/lib/movies/detail";
import { PillLinkGroup, type PillOption } from "./PillLinkGroup";

const DECADES = Array.from({ length: 11 }, (_, i) => 1920 + i * 10);

const RUNTIME_OPTIONS: { value: RuntimeBand; label: string }[] = [
  { value: "short", label: "Under 90 min" },
  { value: "standard", label: "90-150 min" },
  { value: "long", label: "Over 150 min" },
];

const AGE_CEILINGS: AgeCeiling[] = [0, 10, 12, 14, 16, 17, 18];

function genreOptions(
  genres: { id: number; name: string }[],
  params: BrowseParams
): PillOption[] {
  return genres.map((genre) => {
    const active = params.genreIds.includes(genre.id);
    const genreIds = active
      ? params.genreIds.filter((id) => id !== genre.id)
      : [...params.genreIds, genre.id];
    return {
      key: String(genre.id),
      label: genre.name,
      href: buildSearchHref(params, { genreIds, page: 1 }),
      active,
    };
  });
}

function decadeOptions(params: BrowseParams): PillOption[] {
  return [
    {
      key: "any",
      label: "Any decade",
      href: buildSearchHref(params, { decade: null, page: 1 }),
      active: params.decade === null,
    },
    ...DECADES.map((decade) => ({
      key: String(decade),
      label: `${decade}s`,
      href: buildSearchHref(params, { decade, page: 1 }),
      active: params.decade === decade,
    })),
  ];
}

function runtimeOptions(params: BrowseParams): PillOption[] {
  return [
    {
      key: "any",
      label: "Any length",
      href: buildSearchHref(params, { runtimeBand: null, page: 1 }),
      active: params.runtimeBand === null,
    },
    ...RUNTIME_OPTIONS.map((option) => ({
      key: option.value,
      label: option.label,
      href: buildSearchHref(params, { runtimeBand: option.value, page: 1 }),
      active: params.runtimeBand === option.value,
    })),
  ];
}

function ageOptions(params: BrowseParams): PillOption[] {
  return [
    {
      key: "any",
      label: "Any rating",
      href: buildSearchHref(params, { maxAge: null, page: 1 }),
      active: params.maxAge === null,
    },
    ...AGE_CEILINGS.map((age) => ({
      key: String(age),
      label: formatAgeCertification(age),
      href: buildSearchHref(params, { maxAge: age, page: 1 }),
      active: params.maxAge === age,
    })),
  ];
}

export function FilterBar({
  params,
  genres,
}: {
  params: BrowseParams;
  genres: { id: number; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {genres.length > 0 && (
        <PillLinkGroup label="Genre" options={genreOptions(genres, params)} />
      )}
      <PillLinkGroup label="Decade" options={decadeOptions(params)} />
      <PillLinkGroup label="Runtime" options={runtimeOptions(params)} />
      <PillLinkGroup label="Age rating" options={ageOptions(params)} />
      {hasActiveFilters(params) && (
        <Link
          href={clearFiltersHref(params)}
          className="w-fit text-sm text-neon-magenta hover:underline"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
