"use client";

import { Copy, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

export function InviteForm() {
  const [link, setLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const res = await fetch("/api/professor/convites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          displayName: data.get("displayName"),
          role: data.get("role"),
        }),
      });
      if (res.status === 201) {
        const created = (await res.json()) as { link: string; emailSent?: boolean };
        setLink(created.link);
        setEmailSent(created.emailSent === true);
        setSentTo(String(data.get("email") ?? ""));
        form.reset();
      } else if (res.status === 409) {
        setError("Já existe uma conta com este e-mail.");
      } else if (res.status === 422) {
        const body = (await res.json()) as { message?: string };
        setError(body.message ?? "Confira os dados.");
      } else {
        setError("Não foi possível criar o convite agora.");
      }
    } catch {
      setError("Não foi possível criar o convite agora.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link ?? "");
      setCopied(true);
    } catch {
      setCopied(false); // sem permissão: a pessoa copia o texto do campo
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} aria-labelledby="convidar" className="flex flex-col gap-6">
        <h2 id="convidar" className="text-subtitle">Convidar professor ou terapeuta</h2>
        <p className="text-label text-ink-muted">
          A pessoa recebe um link para criar a própria senha. O link vale por 7 dias e só pode ser usado uma vez.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-name">Nome</Label>
          <Input id="invite-name" name="displayName" maxLength={60} autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" name="email" type="email" autoComplete="off" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">Função</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="TEACHER"
            className="min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink"
          >
            <option value="TEACHER">Professor(a)</option>
            <option value="THERAPIST">Terapeuta</option>
          </select>
        </div>

        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          {error ? <Feedback announce={false} tone="redirecionar" title="Quase!">{error}</Feedback> : null}
          {link ? (
            <Feedback announce={false} tone="acerto" title={emailSent ? "Convite enviado!" : "Convite criado!"}>
              {emailSent
                ? `Enviamos um e-mail para ${sentTo}. O link abaixo é uma cópia, caso o e-mail não chegue. Ele não aparece de novo.`
                : "Não conseguimos enviar o e-mail. Envie este link só para a pessoa convidada. Ele não aparece de novo."}
            </Feedback>
          ) : null}
        </div>

        {link ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-link">Link do convite</Label>
            <div className="flex flex-wrap gap-4">
              <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1" />
              <Button icon={Copy} onClick={copy}>
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        ) : null}

        <Button type="submit" variant="principal" icon={Send} disabled={pending}>
          Criar convite
        </Button>
      </form>
    </Card>
  );
}
