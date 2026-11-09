"use client";

import { LogOut, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

interface TeamMember {
  id: string;
  displayName: string;
  role: string;
}

interface StudentTeamCardProps {
  studentId: string;
  displayName: string;
  /** Quem está vendo a página. */
  currentAdultId: string;
  team: TeamMember[];
  /** Com o consentimento revogado, ninguém novo pode ser adicionado. */
  active: boolean;
}

const ROLE_LABEL: Record<string, string> = { TEACHER: "Professor(a)", THERAPIST: "Terapeuta" };

export function StudentTeamCard({ studentId, displayName, currentAdultId, team, active }: StudentTeamCardProps) {
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const url = `/api/professor/alunos/${studentId}/profissionais`;
  const alone = team.length === 1;
  const target = team.find((a) => a.id === confirming);
  const leaving = target?.id === currentAdultId;

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        adult?: { displayName: string };
        emailSent?: boolean;
        message?: string;
      };
      if (!res.ok || !data.adult) {
        setMessage({ ok: false, text: data.message ?? "Não foi possível adicionar agora. Tente de novo." });
        return;
      }
      const notice = data.emailSent ? "" : " O e-mail de aviso não foi enviado: avise a pessoa.";
      setMessage({ ok: true, text: `${data.adult.displayName} agora acompanha ${displayName}.${notice}` });
      setEmail("");
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Não foi possível adicionar agora. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${url}/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setMessage({ ok: false, text: data.message ?? "Não foi possível concluir agora. Tente de novo." });
        return;
      }
      if (leaving) {
        router.push("/professor");
        return;
      }
      setMessage({ ok: true, text: `${target.displayName} não acompanha mais ${displayName}.` });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Não foi possível concluir agora. Tente de novo." });
    } finally {
      setConfirming(null);
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-subtitle">Quem acompanha</h2>
        <p className="text-label text-ink-muted">
          Todos veem a evolução de {displayName} e têm os mesmos poderes, inclusive excluir o aluno.
        </p>
      </div>

      <div role="status" aria-live="polite">
        {message ? (
          <Feedback announce={false} tone={message.ok ? "acerto" : "redirecionar"} title={message.ok ? "Pronto!" : "Quase!"}>
            {message.text}
          </Feedback>
        ) : null}
      </div>

      <ul className="flex flex-col gap-4">
        {team.map((adult) => {
          const you = adult.id === currentAdultId;
          return (
            <li key={adult.id} className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex flex-col">
                <span className="text-body">{you ? `${adult.displayName} (você)` : adult.displayName}</span>
                <span className="text-label text-ink-muted">{ROLE_LABEL[adult.role] ?? adult.role}</span>
              </span>
              {alone ? null : (
                <Button
                  icon={you ? LogOut : UserMinus}
                  aria-label={you ? "Sair do acompanhamento" : `Remover ${adult.displayName}`}
                  onClick={() => setConfirming(adult.id)}
                  disabled={confirming !== null}
                >
                  {you ? "Sair" : "Remover"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {alone ? <p className="text-label text-ink-muted">Você é a única pessoa acompanhando {displayName}.</p> : null}

      {target ? (
        <div role="group" aria-label="Confirmar saída do acompanhamento" className="flex flex-col gap-4">
          <p className="text-body">
            {leaving
              ? `Sair do acompanhamento? ${displayName} deixa de aparecer no seu painel.`
              : `Remover ${target.displayName}? Essa pessoa deixa de ver ${displayName}.`}
          </p>
          <div className="flex flex-wrap gap-4">
            <Button variant="principal" icon={leaving ? LogOut : UserMinus} onClick={remove} disabled={busy}>
              {leaving ? "Sim, sair" : "Sim, remover"}
            </Button>
            <Button onClick={() => setConfirming(null)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {active ? (
        <form onSubmit={add} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${uid}-email`}>E-mail do colega</Label>
            <Input
              id={`${uid}-email`}
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" icon={UserPlus} disabled={busy} className="self-start">
            Adicionar
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
