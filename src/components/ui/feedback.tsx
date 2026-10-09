import type { ReactNode } from "react";
import { CircleCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedbackProps {
  tone: "acerto" | "redirecionar";
  /** Uma palavra de abertura: "Isso!", "Quase!". */
  title: string;
  /** Frase específica sobre a tarefa. */
  children: ReactNode;
  className?: string;
  /**
   * true (padrão): o próprio bloco é uma região `status`.
   * false: use quando um pai já é a região live (ela precisa existir antes do texto mudar).
   */
  announce?: boolean;
}

/** Não existe estado de erro: ou acerto, ou convite gentil para tentar de novo. */
export function Feedback({ tone, title, children, className, announce = true }: FeedbackProps) {
  const Icon = tone === "acerto" ? CircleCheck : RotateCcw;
  return (
    <div
      role={announce ? "status" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-[28px] border-2 px-5 py-4 text-body",
        tone === "acerto"
          ? "border-success-border bg-success-bg text-success-ink"
          : "border-retry-border bg-retry-bg text-retry-ink",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-8 shrink-0" strokeWidth={2.5} />
      {/* div, não p: o conteúdo pode ter listas e outros blocos (HTML inválido causa erro de hidratação). */}
      <div>
        <strong className="block font-extrabold">{title}</strong>
        {children}
      </div>
    </div>
  );
}
