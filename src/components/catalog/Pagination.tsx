import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BrowseSort } from "@/lib/movies/browse";

function PageLink({
  sort,
  page,
  disabled,
  children,
}: {
  sort: BrowseSort;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const className = cn(
    "rounded-full border px-3 py-1 text-sm transition-colors",
    disabled
      ? "pointer-events-none border-border text-muted-foreground/50"
      : "border-border text-foreground hover:border-neon-cyan hover:text-neon-cyan"
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={`/?sort=${sort}&page=${page}`} className={className}>
      {children}
    </Link>
  );
}

export function Pagination({
  page,
  sort,
  totalPages,
}: {
  page: number;
  sort: BrowseSort;
  totalPages: number;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-4 pt-4"
    >
      <PageLink sort={sort} page={page - 1} disabled={page <= 1}>
        Prev
      </PageLink>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <PageLink sort={sort} page={page + 1} disabled={page >= totalPages}>
        Next
      </PageLink>
    </nav>
  );
}
