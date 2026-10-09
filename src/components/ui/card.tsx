import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Painel de atividade: radius-xl, padding space-8. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[28px] border-2 border-border bg-surface p-8 shadow-rest", className)}
      {...props}
    />
  );
}
