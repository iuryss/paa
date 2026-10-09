"use client";

import { useId, useState } from "react";

export interface ChartPoint {
  /** Rótulo curto do eixo X (ex.: "07/10"). */
  label: string;
  /** Texto completo para o leitor de tela, o tooltip e a tabela (ex.: "07/10 · Letras"). */
  detail: string;
  value: number;
}

/** Serializável de propósito: formatos por nome, nunca funções (Server → Client). */
export type ChartUnit = "percent" | "seconds";

interface LineChartProps {
  title: string;
  description: string;
  unit: ChartUnit;
  points: ChartPoint[];
}

const W = 640;
const H = 260;
const M = { top: 16, right: 24, bottom: 40, left: 56 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

export function formatValue(unit: ChartUnit, value: number): string {
  return unit === "percent" ? `${Math.round(value * 100)}%` : `${value.toFixed(1).replace(".", ",")} s`;
}

/** Teto "redondo" do eixo Y para segundos (1, 2, 5, 10, 20, 50…). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function LineChart({ title, description, unit, points }: LineChartProps) {
  const uid = useId();
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <figure className="flex flex-col gap-2">
        <figcaption className="text-subtitle">{title}</figcaption>
        <p className="text-ink-muted">Ainda não há sessões neste período.</p>
      </figure>
    );
  }

  const yMax = unit === "percent" ? 1 : niceMax(Math.max(...points.map((p) => p.value)));
  const ticks = [0, yMax / 2, yMax];
  const x = (i: number) => (points.length === 1 ? M.left + PLOT_W / 2 : M.left + (i * PLOT_W) / (points.length - 1));
  const y = (v: number) => M.top + PLOT_H - (Math.min(v, yMax) / yMax) * PLOT_H;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const shown = points[active ?? points.length - 1]!;
  const labelIdx = new Set([0, points.length - 1, ...(points.length >= 5 ? [Math.floor(points.length / 2)] : [])]);

  return (
    <figure className="flex flex-col gap-3" aria-describedby={`${uid}-desc`}>
      <figcaption className="flex flex-col gap-1">
        <span className="text-subtitle">{title}</span>
        <span id={`${uid}-desc`} className="text-label text-ink-muted">
          {description}
        </span>
      </figcaption>

      {/* Leitura do ponto ativo (hover, foco ou, por padrão, a última sessão). */}
      <p aria-live="polite" className="text-body">
        <span className="text-ink-muted">{shown.detail}: </span>
        <strong>{formatValue(unit, shown.value)}</strong>
      </p>

      <div tabIndex={0} role="group" aria-label={`Gráfico: ${title}`} className="overflow-x-auto rounded-[12px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px]" width="100%" focusable="false">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border-subtle)"
                strokeWidth={t === 0 ? 1.5 : 1}
              />
              <text x={M.left - 10} y={y(t) + 5} textAnchor="end" fontSize={14} fill="var(--ink-muted)">
                {formatValue(unit, t)}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            labelIdx.has(i) ? (
              <text key={p.label + i} x={x(i)} y={H - 12} textAnchor="middle" fontSize={14} fill="var(--ink-muted)">
                {p.label}
              </text>
            ) : null,
          )}

          {points.length > 1 ? (
            <path d={path} fill="none" stroke="var(--primary-border)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {points.map((p, i) => (
            <g key={`${p.detail}-${i}`}>
              {/* Alvo de toque/foco maior que a marca. */}
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={16}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${p.detail}: ${formatValue(unit, p.value)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                style={{ outline: "none" }}
              />
              {/* Marca de 10px (≥ 8px) com anel de 2px na cor da superfície. */}
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={active === i ? 7 : 5}
                fill="var(--primary-border)"
                stroke="var(--surface)"
                strokeWidth={2}
                pointerEvents="none"
              />
              {active === i ? (
                <circle cx={x(i)} cy={y(p.value)} r={11} fill="none" stroke="var(--focus-ring)" strokeWidth={2} pointerEvents="none" />
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <details>
        <summary className="cursor-pointer text-label">Ver como tabela</summary>
        <table className="mt-3 w-full text-left text-label">
          <thead>
            <tr>
              <th scope="col" className="pb-2 pr-4">Sessão</th>
              <th scope="col" className="pb-2">Valor</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={`${p.detail}-${i}`} className="border-t border-border-subtle">
                <th scope="row" className="py-2 pr-4 font-semibold">{p.detail}</th>
                <td className="py-2">{formatValue(unit, p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
