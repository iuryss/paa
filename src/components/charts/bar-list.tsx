export interface BarItem {
  label: string;
  value: number;
}

interface BarListProps {
  title: string;
  description: string;
  items: BarItem[];
}

/** Barras horizontais de uma só série (sem legenda: o título nomeia). Valor direto no fim de cada barra. */
export function BarList({ title, description, items }: BarListProps) {
  const total = items.reduce((n, i) => n + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span className="text-subtitle">{title}</span>
        <span className="text-label text-ink-muted">{description}</span>
      </figcaption>

      {total === 0 ? (
        <p className="text-ink-muted">Ainda não há sessões neste período.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.label} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-4">
              <span className="text-label">{item.label}</span>
              {/* Barra decorativa: o número ao lado carrega a informação. Ponta de dados arredondada. */}
              <span aria-hidden="true" className="h-4 rounded-r-[4px] bg-surface-sunken">
                <span
                  className="block h-full rounded-r-[4px] bg-primary-border"
                  style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 6 : 0 }}
                />
              </span>
              <span className="text-right text-label font-extrabold">{item.value}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
