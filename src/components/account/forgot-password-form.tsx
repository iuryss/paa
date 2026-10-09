"use client";

import { Mail } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

export interface ForgotState {
  done: boolean;
  error: string | null;
}

type ForgotAction = (prev: ForgotState, formData: FormData) => Promise<ForgotState>;

export function ForgotPasswordForm({ action }: { action: ForgotAction }) {
  const [state, formAction, pending] = useActionState(action, { done: false, error: null });

  return (
    <form action={formAction} aria-label="Esqueci minha senha" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div role="status" aria-live="polite">
        {state.error ? (
          <Feedback announce={false} tone="redirecionar" title="Quase!">{state.error}</Feedback>
        ) : null}
        {/* Mesma resposta exista ou não a conta: ninguém descobre quem tem cadastro. */}
        {state.done ? (
          <Feedback announce={false} tone="acerto" title="Pedido recebido!">
            Se este e-mail tiver cadastro, enviaremos um link para criar uma nova senha. Ele vale por 60 minutos.
          </Feedback>
        ) : null}
      </div>
      <Button type="submit" variant="principal" icon={Mail} disabled={pending}>
        Enviar link
      </Button>
    </form>
  );
}
