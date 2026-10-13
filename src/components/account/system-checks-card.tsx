import { CircleCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { SystemCheck } from "@/lib/system-checks";

/** Estado com ícone + palavra + cor (a cor nunca vai sozinha). */
export function SystemChecksCard({ checks }: { checks: SystemCheck[] }) {
  const warnings = checks.filter((c) => c.status === "warn").length;
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-subtitle">Verificação do sistema</h2>
        <p className="text-label text-ink-muted">
          {warnings === 0 ? "Tudo certo." : `${warnings} ${warnings === 1 ? "ponto precisa" : "pontos precisam"} de atenção.`} Nenhum segredo é exibido aqui.
        </p>
      </div>
      <ul className="flex flex-col gap-4">
        {checks.map((check) => {
          const ok = check.status === "ok";
          const Icon = ok ? CircleCheck : TriangleAlert;
          return (
            <li key={check.id} className="flex items-start gap-3">
              <Icon
                aria-hidden="true"
                strokeWidth={2.5}
                className={`mt-1 size-6 shrink-0 ${ok ? "text-success-ink" : "text-retry-ink"}`}
              />
              <p className="flex flex-col">
                <span className="text-label">
                  {check.label}: <strong>{ok ? "ok" : "atenção"}</strong>
                </span>
                <span className="text-ink-muted">{check.detail}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
