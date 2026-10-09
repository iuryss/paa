"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Opções grandes, em fieldset, operáveis por teclado; o selecionado leva ícone (cor nunca sozinha). */
export function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  name: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-3 text-subtitle">{legend}</legend>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label key={opt.value} className="block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex min-h-target items-center justify-between gap-2 rounded-[20px] border-2 px-6 text-button",
                "peer-focus-visible:ring-4 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-[3px] peer-focus-visible:ring-offset-page",
                selected
                  ? "border-primary-border bg-accent text-on-accent"
                  : "border-border bg-surface text-ink",
              )}
            >
              {opt.label}
              {selected ? <Check aria-hidden="true" className="size-7" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function Toggle({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-target cursor-pointer items-center justify-between gap-4 rounded-[20px] border-2 border-border bg-surface px-6 text-button"
    >
      {label}
      <span className="flex items-center gap-2 text-label">
        {checked ? "Ligado" : "Desligado"}
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-8 accent-[var(--primary-border)]"
        />
      </span>
    </label>
  );
}

export const THEME_OPTIONS = [
  { value: "calmo", label: "Baixo Estímulo" },
  { value: "foco", label: "Foco Alto" },
  { value: "contraste", label: "Alto Contraste" },
] as const;

export const MODE_OPTIONS = [
  { value: "textual", label: "Textual" },
  { value: "pictografico", label: "Com figuras (PECS)" },
] as const;

export const FONT_OPTIONS = [
  { value: "sans", label: "Letra padrão" },
  { value: "leitura", label: "Letra de leitura fácil" },
] as const;
