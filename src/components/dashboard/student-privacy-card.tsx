"use client";

import { Download, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StudentPrivacyCardProps {
  studentId: string;
  displayName: string;
  /** false = consentimento revogado (acesso bloqueado). */
  active: boolean;
  /** Outros profissionais que também acompanham o aluno. */
  otherAdults: number;
}

type Mode = "idle" | "revoke" | "grant" | "delete";

const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function StudentPrivacyCard({ studentId, displayName, active, otherAdults }: StudentPrivacyCardProps) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>("idle");
  const [typed, setTyped] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setMode("idle");
    setTyped("");
    setConsentChecked(false);
  };

  async function send(url: string, init: RequestInit, after: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(String(res.status));
      after();
    } catch {
      setError("Não foi possível concluir agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const post = (action: "revogar" | "registrar") =>
    send(
      `/api/professor/alunos/${studentId}/consentimento`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      () => {
        close();
        router.refresh();
      },
    );

  const remove = () =>
    send(
      `/api/professor/alunos/${studentId}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) },
      () => router.push("/professor"),
    );

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-subtitle">Privacidade e dados</h2>
        <p className="text-label text-ink-muted">
          Direitos do responsável (LGPD): cópia dos dados, revogar o consentimento e excluir.{" "}
          <Link href="/privacidade" className="underline underline-offset-4">Política de privacidade</Link>
        </p>
      </div>

      <div role="status" aria-live="polite">
        {error ? <Feedback announce={false} tone="redirecionar" title="Quase!">{error}</Feedback> : null}
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Âncora com download: baixa direto do servidor, sem carregar o JSON na tela. */}
        <a
          href={`/api/professor/alunos/${studentId}/exportar`}
          download
          className={cn(buttonVariants({ variant: "secundaria" }))}
        >
          <Download aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Baixar cópia dos dados
        </a>
        {active ? (
          <Button icon={ShieldOff} onClick={() => setMode("revoke")} disabled={mode !== "idle"}>
            Revogar consentimento
          </Button>
        ) : (
          <Button icon={ShieldCheck} onClick={() => setMode("grant")} disabled={mode !== "idle"}>
            Registrar novo consentimento
          </Button>
        )}
        <Button icon={Trash2} onClick={() => setMode("delete")} disabled={mode !== "idle"}>
          Excluir definitivamente
        </Button>
      </div>

      {mode === "revoke" ? (
        <div role="group" aria-label="Confirmar revogação do consentimento" className="flex flex-col gap-4">
          <Feedback tone="redirecionar" title="Revogar o consentimento?">
            {displayName} perde o acesso agora e some dos painéis. Os dados ficam guardados, sem uso, até você excluí-los
            ou registrar um novo consentimento.
          </Feedback>
          <div className="flex flex-wrap gap-4">
            <Button variant="principal" icon={ShieldOff} disabled={busy} onClick={() => post("revogar")}>
              Sim, revogar
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </div>
        </div>
      ) : null}

      {mode === "grant" ? (
        <div role="group" aria-label="Registrar novo consentimento" className="flex flex-col gap-4">
          <label className="flex items-start gap-3 text-body">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1 size-6 shrink-0"
            />
            <span>
              Tenho o consentimento do responsável legal para o tratamento dos dados de {displayName}, conforme o{" "}
              <a href="/termo" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                termo de consentimento
              </a>
              .
            </span>
          </label>
          <div className="flex flex-wrap gap-4">
            <Button variant="principal" icon={ShieldCheck} disabled={busy || !consentChecked} onClick={() => post("registrar")}>
              Registrar e reativar
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </div>
        </div>
      ) : null}

      {mode === "delete" ? (
        <div role="group" aria-label="Confirmar exclusão definitiva" className="flex flex-col gap-4">
          <Feedback tone="redirecionar" title="Isso não pode ser desfeito">
            Todos os dados de {displayName} serão apagados: perfil, atividades, sessões e respostas.
            {otherAdults > 0
              ? ` ${otherAdults === 1 ? "Outro profissional também acompanha" : `Outros ${otherAdults} profissionais também acompanham`} este aluno e perderá${otherAdults === 1 ? "" : "ão"} o acesso.`
              : ""}{" "}
            Baixe a cópia dos dados antes, se precisar.
          </Feedback>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-confirm`}>Para confirmar, digite o apelido: {displayName}</Label>
            <Input
              id={`${uid}-confirm`}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Button
              variant="principal"
              icon={Trash2}
              disabled={busy || norm(typed) !== norm(displayName)}
              onClick={remove}
            >
              Excluir para sempre
            </Button>
            <Button onClick={close}>Cancelar</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
