"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { TERMS_VERSION } from "@/lib/terms";

interface Created {
  displayName: string;
  studentCode: string;
  pin: string;
}

export function NewStudentForm() {
  const router = useRouter();
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/professor/alunos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          guardianConsent: data.get("guardianConsent") === "on",
          termsVersion: TERMS_VERSION,
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 422
            ? "Confira o apelido (2 a 30 letras, sem e-mail) e o consentimento."
            : "Não foi possível cadastrar agora. Tente de novo.",
        );
        return;
      }
      setCreated((await res.json()) as Created);
      form.reset();
      router.refresh();
    } catch {
      setError("Não foi possível cadastrar agora. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} aria-labelledby="novo-aluno" className="flex flex-col gap-6">
        <h2 id="novo-aluno" className="text-subtitle">Novo aluno</h2>
        <p className="text-label text-ink-muted">
          Use só um apelido. Não cadastramos nome completo, e-mail nem data de nascimento.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="displayName">Apelido</Label>
          <Input id="displayName" name="displayName" maxLength={30} autoComplete="off" required />
        </div>
        <label className="flex items-start gap-3 text-body">
          <input type="checkbox" name="guardianConsent" required className="mt-1 size-6 shrink-0" />
          <span>
            Tenho o consentimento do responsável legal para o tratamento dos dados deste aluno, conforme o{" "}
            <a href="/termo" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              termo de consentimento
            </a>
            .
          </span>
        </label>

        <div role="status" aria-live="polite">
          {error ? (
            <Feedback announce={false} tone="redirecionar" title="Quase!">{error}</Feedback>
          ) : null}
          {created ? (
            <Feedback announce={false} tone="acerto" title={`${created.displayName} foi cadastrado(a)!`}>
              Código: <strong>{created.studentCode}</strong> · PIN: <strong>{created.pin}</strong>.
              Anote agora: o PIN não aparece de novo.
            </Feedback>
          ) : null}
        </div>

        <Button type="submit" variant="principal" icon={UserPlus} disabled={pending}>
          Cadastrar
        </Button>
      </form>
    </Card>
  );
}
