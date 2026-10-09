import type { ButtonHTMLAttributes, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Três variantes, só três (design system → Botões). */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 px-8 min-h-target rounded-[20px] border-2",
    "font-sans text-button select-none touch-manipulation",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring",
    "focus-visible:ring-offset-[3px] focus-visible:ring-offset-page",
    "motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-bg disabled:text-disabled-ink",
  ],
  {
    variants: {
      variant: {
        principal: "min-h-target-lg bg-primary text-on-primary border-primary-border",
        secundaria: "bg-surface text-ink border-border",
        icone: "size-16 px-0 rounded-full bg-surface text-ink border-border",
      },
    },
    defaultVariants: { variant: "secundaria" },
  },
);

type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Ícone em currentColor, sempre presente (cor nunca sozinha). */
  icon?: LucideIcon;
  /** React 19: ref é uma prop comum. */
  ref?: Ref<HTMLButtonElement>;
};

export type ButtonProps =
  | (Base & { variant?: "principal" | "secundaria"; "aria-label"?: string })
  | (Base & { variant: "icone"; "aria-label": string });

export function Button({ variant, icon: Icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant }), className)} {...props}>
      {Icon ? <Icon aria-hidden="true" className="size-7 shrink-0" strokeWidth={2.5} /> : null}
      {variant === "icone" ? null : children}
    </button>
  );
}
