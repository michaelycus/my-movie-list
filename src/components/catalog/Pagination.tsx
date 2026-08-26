import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buildSearchHref, type BrowseParams } from "@/lib/movies/browse";

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: BrowseParams;
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
    <Link href={buildSearchHref(params, { page })} className={className}>
      {children}
    </Link>
  );
}

export function Pagination({
  params,
  totalPages,
}: {
  params: BrowseParams;
  totalPages: number;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-4 pt-4"
    >
      <PageLink params={params} page={params.page - 1} disabled={params.page <= 1}>
        Prev
      </PageLink>
      <span className="text-sm text-muted-foreground">
        Page {params.page} of {totalPages}
      </span>
      <PageLink params={params} page={params.page + 1} disabled={params.page >= totalPages}>
        Next
      </PageLink>
    </nav>
  );
}
