"use client";

import { UserCheck } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";

export interface AcceptState {
  error: string | null;
}

type AcceptAction = (prev: AcceptState, formData: FormData) => Promise<AcceptState>;

interface SetPasswordFormProps {
  action: AcceptAction;
  /** Rótulo do botão e do formulário (padrão: criação de conta por convite). */
  submitLabel?: string;
  passwordLabel?: string;
}

/** Duas senhas + botão. Serve ao convite ("Criar conta") e à redefinição ("Salvar nova senha"). */
export function AcceptInvitationForm({
  action,
  submitLabel = "Criar conta",
  passwordLabel = "Crie uma senha",
}: SetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} aria-label={submitLabel} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{passwordLabel}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          aria-describedby="password-hint"
          required
        />
        <p id="password-hint" className="text-label text-ink-muted">Pelo menos 10 caracteres.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repita a senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <div role="status" aria-live="polite">
        {state.error ? (
          <Feedback announce={false} tone="redirecionar" title="Quase!">{state.error}</Feedback>
        ) : null}
      </div>
      <Button type="submit" variant="principal" icon={UserCheck} disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
