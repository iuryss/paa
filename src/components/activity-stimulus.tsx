"use client";

import { User } from "lucide-react";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { Pictogram } from "@/components/pictogram";
import type { Direction, Stimulus } from "@/lib/validation/activities";

const CELL = "flex size-28 items-center justify-center rounded-[12px] border-2 p-2 text-center sm:size-32";

/** Mapa 3×3: "Você" no centro e a peça em uma das quatro direções. */
function MapStimulus({
  piece,
  position,
}: {
  piece: { label: string; icon?: Parameters<typeof Pictogram>[0]["name"] };
  position: Direction;
}) {
  const cells: (Direction | "centro" | null)[] = [
    null, "norte", null,
    "oeste", "centro", "leste",
    null, "sul", null,
  ];
  return (
    <div
      role="img"
      aria-label={`Mapa: ${piece.label} fica ao ${position} de você`}
      className="grid grid-cols-3 gap-2"
    >
      {cells.map((cell, i) => {
        if (cell === "centro") {
          return (
            <div key={i} className={`${CELL} border-border bg-surface-sunken text-ink`}>
              <span className="flex flex-col items-center gap-1 text-label">
                <User aria-hidden="true" className="size-8" strokeWidth={2.5} />
                Você
              </span>
            </div>
          );
        }
        if (cell === position) {
          return (
            <div key={i} className={`${CELL} border-primary-border bg-accent text-on-accent`}>
              <AdaptiveLabel
                text={piece.label}
                icon={piece.icon ? <Pictogram name={piece.icon} /> : undefined}
              />
            </div>
          );
        }
        return <div key={i} aria-hidden="true" className={`${CELL} border-transparent`} />;
      })}
    </div>
  );
}

function Objects({ n }: { n: number }) {
  return (
    <span className="flex flex-wrap items-center justify-center gap-2">
      {Array.from({ length: n }, (_, i) => (
        <Pictogram key={i} name="maca" className="size-12" />
      ))}
    </span>
  );
}

function CountStimulus({ a, b }: { a: number; b: number }) {
  const label = b > 0 ? `${a} maçãs mais ${b} maçãs` : `${a} maçãs`;
  return (
    <div className="flex flex-col items-center gap-6">
      <div role="img" aria-label={label} className="flex flex-wrap items-center justify-center gap-6">
        <Objects n={a} />
        {b > 0 ? (
          <>
            <span aria-hidden="true" className="text-title">+</span>
            <Objects n={b} />
          </>
        ) : null}
      </div>
      {/* Contagem simples (b = 0): sem numeral, ele entregaria a resposta. */}
      {b > 0 ? (
        <p aria-hidden="true" className="text-numeral">
          {a} + {b} = ?
        </p>
      ) : null}
    </div>
  );
}

export function ActivityStimulus({ stimulus }: { stimulus: Stimulus }) {
  switch (stimulus.kind) {
    case "map":
      return <MapStimulus piece={stimulus.piece} position={stimulus.position} />;
    case "letter":
      return (
        <p className="font-letra text-letra-bastao" aria-label={`Letra ${stimulus.display}`}>
          {stimulus.display}
        </p>
      );
    case "count":
      return <CountStimulus a={stimulus.a} b={stimulus.b} />;
  }
}
