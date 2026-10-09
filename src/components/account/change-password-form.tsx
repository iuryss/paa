"use client";

import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

const MESSAGES: Record<number, string> = {
  400: "A senha atual não confere.",
  429: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
};

export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword") ?? "");

    if (newPassword !== data.get("confirm")) {
      setMessage({ ok: false, text: "As senhas novas não são iguais." });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/conta/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword }),
      });
      if (res.ok) {
        form.reset();
        setMessage({ ok: true, text: "Senha alterada." });
      } else if (res.status === 422) {
        const body = (await res.json()) as { message?: string };
        setMessage({ ok: false, text: body.message ?? "Confira os dados." });
      } else {
        setMessage({ ok: false, text: MESSAGES[res.status] ?? "Não foi possível alterar agora." });
      }
    } catch {
      setMessage({ ok: false, text: "Não foi possível alterar agora." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} aria-labelledby="troca-senha" className="flex flex-col gap-6">
        <h2 id="troca-senha" className="text-subtitle">Trocar senha</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPassword">Senha atual</Label>
          <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="newPassword">Nova senha</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            aria-describedby="newPassword-hint"
            required
          />
          <p id="newPassword-hint" className="text-label text-ink-muted">Pelo menos 10 caracteres.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Repita a nova senha</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <div role="status" aria-live="polite">
          {message ? (
            <Feedback
              announce={false}
              tone={message.ok ? "acerto" : "redirecionar"}
              title={message.ok ? "Pronto!" : "Quase!"}
            >
              {message.text}
            </Feedback>
          ) : null}
        </div>
        <Button type="submit" variant="principal" icon={Save} disabled={pending}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}
