import Link from "next/link";
import { PERIODS, type Period } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

/** Filtro de período em uma linha, acima dos gráficos. Links (não JS): funciona em qualquer navegador. */
export function PeriodNav({ current, basePath }: { current: Period; basePath: string }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap items-center gap-3">
      <span className="text-label text-ink-muted">Período</span>
      {PERIODS.map((days) => (
        <Link
          key={days}
          href={`${basePath}?dias=${days}`}
          aria-current={days === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-target items-center rounded-[20px] border-2 px-5 text-label",
            days === current
              ? "border-primary-border bg-accent text-on-accent"
              : "border-border bg-surface text-ink",
          )}
        >
          {days} dias
        </Link>
      ))}
    </nav>
  );
}
