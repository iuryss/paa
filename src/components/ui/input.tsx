import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // eslint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor é passado por quem usa
  return <label className={cn("block text-label text-ink", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink",
        "placeholder:text-ink-muted disabled:bg-disabled-bg disabled:text-disabled-ink",
        className,
      )}
      {...props}
    />
  );
}
