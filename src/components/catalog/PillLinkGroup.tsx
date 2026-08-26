import Link from "next/link";
import { cn } from "@/lib/utils";

export interface PillOption {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export function PillLinkGroup({
  label,
  options,
}: {
  label: string;
  options: PillOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            option.active
              ? "border-neon-cyan text-neon-cyan"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
