"use client";

import { Check, Delete } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { encodeTyped, parseNumber } from "@/lib/activities/math";
import { cn } from "@/lib/utils";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "-", "0", ",", "/"] as const;
const MAX_LENGTH = 12;

interface NumberPadProps {
  expression: string;
  /** Terminou este passo: o teclado trava e mostra a resposta. */
  done: boolean;
  /** Devolve true se a resposta estava certa (a errada é limpa, para tentar de novo). */
  onSubmit: (value: string) => boolean;
}

/**
 * Resposta numérica: a conta, o campo e um teclado grande na tela. `inputMode="none"` evita o teclado
 * do tablet cobrir a conta; quem tem teclado físico digita no campo e confirma com Enter.
 */
export function NumberPad({ expression, done, onSubmit }: NumberPadProps) {
  const uid = useId();
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState(false);

  const type = (key: string) => {
    if (done || value.length >= MAX_LENGTH) return;
    setNotice(false);
    setValue(value + key);
  };

  const submit = () => {
    if (done) return;
    if (parseNumber(value) === null || encodeTyped(value) === null) return setNotice(true);
    if (!onSubmit(value)) setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3 text-title">
        <span>
          <MathText text={expression} />
        </span>
        <span aria-hidden="true">=</span>
        <label htmlFor={`${uid}-resposta`} className="sr-only">
          Sua resposta
        </label>
        <input
          id={`${uid}-resposta`}
          inputMode="none"
          autoComplete="off"
          value={value}
          readOnly={done}
          maxLength={MAX_LENGTH}
          onChange={(e) => setValue(e.target.value.replace(/[^\d,./-]/g, "").replace(".", ","))}
          onKeyDown={onKeyDown}
          aria-describedby={notice ? `${uid}-aviso` : undefined}
          className={cn(
            "h-16 w-40 rounded-[12px] border-2 px-3 text-center text-title",
            done ? "border-success-border bg-success-bg text-success-ink" : "border-dashed border-drop-active-border bg-drop-active-bg text-ink",
          )}
        />
      </div>
      <p id={`${uid}-aviso`} className="min-h-6 text-label text-ink-muted">
        {notice ? "Digite um número, como 8, -3, 0,5 ou 1/8." : ""}
      </p>
      {!done ? (
        <div role="group" aria-label="Teclado de números" className="grid w-full max-w-sm grid-cols-3 gap-3">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key === "-" ? "menos" : key === "," ? "vírgula" : key === "/" ? "barra de fração" : key}
              onClick={() => type(key)}
              className="flex min-h-target select-none touch-manipulation items-center justify-center rounded-[20px] border-2 border-border bg-surface text-subtitle text-ink"
            >
              {key}
            </button>
          ))}
          <Button icon={Delete} aria-label="Apagar" className="col-span-2 justify-center" onClick={() => setValue(value.slice(0, -1))}>
            Apagar
          </Button>
          <Button variant="principal" icon={Check} className="col-span-3 justify-center" onClick={submit}>
            Pronto
          </Button>
        </div>
      ) : null}
    </div>
  );
}
