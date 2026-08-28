import Link from "next/link";
import { navPillVariants } from "@/lib/ui";

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
          className={navPillVariants({ state: option.active ? "active" : "inactive" })}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
