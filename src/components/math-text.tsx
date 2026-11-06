import { Fragment } from "react";
import { hasMath, parseMath, spokenMath, type MathPart } from "@/lib/activities/math";

function Part({ part }: { part: MathPart }) {
  switch (part.kind) {
    case "power":
      return (
        <span className="whitespace-nowrap">
          {part.base}
          <sup className="text-[0.7em] leading-none">{part.exponent}</sup>
        </span>
      );
    case "fraction":
      return (
        <span className="mx-1 inline-flex flex-col items-center align-middle text-[0.85em] leading-tight">
          <span className="border-b-2 border-current px-1">{part.top}</span>
          <span className="px-1">{part.bottom}</span>
        </span>
      );
    case "root":
      return (
        <span className="whitespace-nowrap">
          √<span className="border-t-2 border-current">{part.value}</span>
        </span>
      );
    default:
      return <>{part.text}</>;
  }
}

/**
 * Texto com notação matemática: `2^3` aparece como 2³, `1/2` como fração, `raiz(5)` como √5.
 * O desenho fica escondido do leitor de tela, que ouve "2 elevado a 3".
 * Texto sem conta nenhuma sai igual, sem elementos a mais.
 */
export function MathText({ text }: { text: string }) {
  if (!hasMath(text)) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">
        {parseMath(text).map((part, i) => (
          <Fragment key={i}>
            <Part part={part} />
          </Fragment>
        ))}
      </span>
      <span className="sr-only">{spokenMath(text)}</span>
    </>
  );
}
