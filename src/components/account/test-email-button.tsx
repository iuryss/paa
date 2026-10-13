"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";

type Message = { ok: boolean; title: string; text: string };

export function TestEmailButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function send() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/conta/email-teste", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        to?: string;
        provider?: string;
        hint?: string;
        code?: string;
      };
      if (res.ok) {
        setMessage(
          body.provider === "console"
            ? { ok: true, title: "Simulado", text: "O e-mail apareceu no console do servidor. Nada foi enviado de verdade (modo terminal)." }
            : { ok: true, title: "Enviado!", text: `Mandamos um e-mail de teste para ${body.to}. Confira a caixa de entrada e o spam.` },
        );
      } else if (res.status === 429) {
        setMessage({ ok: false, title: "Calma!", text: "Você já fez 3 testes na última hora. Tente de novo mais tarde." });
      } else {
        setMessage({ ok: false, title: "Quase!", text: body.hint ?? "Não foi possível enviar agora." });
      }
    } catch {
      setMessage({ ok: false, title: "Quase!", text: "Não foi possível enviar agora." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite">
        {message ? (
          <Feedback announce={false} tone={message.ok ? "acerto" : "redirecionar"} title={message.title}>
            {message.text}
          </Feedback>
        ) : null}
      </div>
      <Button icon={Mail} onClick={send} disabled={pending} className="self-start">
        Enviar e-mail de teste para mim
      </Button>
    </div>
  );
}
