"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import type { SearchResultMovie } from "@/types/movie";
import { buttonVariants } from "@/lib/ui";
import { PosterCard } from "./PosterCard";

const MATCH_LABELS: Record<SearchResultMovie["matchedVia"], string> = {
  keyword: "Matched: title/cast",
  theme: "Matched: theme",
  "keyword+theme": "Matched: title & theme",
};

type Status = "idle" | "loading" | "error" | "success";

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-2/3 rounded-lg bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function NaturalLanguageSearchBar() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResultMovie[]>([]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || status === "loading") return;

    setStatus("loading");
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      if (!response.ok) throw new Error("search request failed");

      const body: { results: SearchResultMovie[] } = await response.json();
      setResults(body.results);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Search by vibe
        </span>
        <span className="text-xs text-muted-foreground">
          Describe what you&apos;re in the mood for - we&apos;ll figure out the rest.
        </span>
      </div>

      <form onSubmit={handleSubmit} role="search" className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. films for kids under 10, or something bittersweet about growing up"
          aria-label="Search by vibe"
          className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus:border-neon-cyan focus:outline-none focus:ring-2 focus:ring-neon-cyan/20"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={buttonVariants({ intent: "primary" })}
        >
          {status === "loading" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      {status === "loading" && <ResultsSkeleton />}

      {status === "error" && (
        <p className="rounded-lg border border-neon-amber/40 bg-surface px-4 py-3 text-sm text-muted-foreground">
          Couldn&apos;t search right now. Try again.
        </p>
      )}

      {status === "success" && results.length === 0 && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          No matches for that. Try describing it differently.
        </p>
      )}

      {status === "success" && results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {results.map((movie, index) => (
            <div
              key={movie.id}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards"
              style={{ animationDuration: "300ms", animationDelay: `${Math.min(index, 11) * 30}ms` }}
            >
              <PosterCard movie={movie} badge={{ label: MATCH_LABELS[movie.matchedVia] }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
