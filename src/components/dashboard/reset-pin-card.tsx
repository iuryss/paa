"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";

interface ResetPinCardProps {
  studentId: string;
  displayName: string;
}

type Phase = "idle" | "confirm" | "working";

export function ResetPinCard({ studentId, displayName }: ResetPinCardProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<{ pin: string; studentCode: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setPhase("working");
    setError(null);
    try {
      const res = await fetch(`/api/professor/alunos/${studentId}/pin`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as { pin: string; studentCode: string });
    } catch {
      setError("Não foi possível gerar o PIN agora. Tente de novo.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-subtitle">PIN de acesso</h2>
      <p className="text-label text-ink-muted">
        Se {displayName} esqueceu o PIN, gere um novo. O PIN antigo deixa de funcionar na hora.
      </p>

      <div role="status" aria-live="polite">
        {error ? (
          <Feedback announce={false} tone="redirecionar" title="Quase!">{error}</Feedback>
        ) : null}
        {result ? (
          <Feedback announce={false} tone="acerto" title="Novo PIN gerado!">
            Código: <strong>{result.studentCode}</strong> · PIN: <strong>{result.pin}</strong>.
            Anote agora: o PIN não aparece de novo.
          </Feedback>
        ) : null}
      </div>

      {phase === "idle" ? (
        <Button icon={KeyRound} onClick={() => setPhase("confirm")} className="self-start">
          Gerar novo PIN
        </Button>
      ) : (
        <div role="group" aria-label="Confirmar novo PIN" className="flex flex-col gap-4">
          <p className="text-body">Gerar um novo PIN para {displayName}?</p>
          <div className="flex flex-wrap gap-6">
            <Button variant="principal" icon={KeyRound} onClick={reset} disabled={phase === "working"}>
              Sim, gerar
            </Button>
            <Button onClick={() => setPhase("idle")} disabled={phase === "working"}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
