import {
  Apple,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  House,
  School,
  Star,
  TreePine,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/validation/activities";

const ICONS: Record<IconName, LucideIcon> = {
  norte: ArrowUp,
  sul: ArrowDown,
  leste: ArrowRight,
  oeste: ArrowLeft,
  casa: House,
  escola: School,
  arvore: TreePine,
  maca: Apple,
  estrela: Star,
  circulo: Circle,
};

/** Pictograma decorativo: o significado vem sempre do texto ao lado (cor/ícone nunca sozinhos). */
export function Pictogram({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" strokeWidth={2.5} className={className ?? "size-full"} />;
}
