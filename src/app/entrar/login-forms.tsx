"use client";

import { LogIn } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { LoginState } from "./actions";

type LoginAction = (prev: LoginState, formData: FormData) => Promise<LoginState>;

const initial: LoginState = { error: null };

function Message({ text }: { text: string | null }) {
  return (
    <div role="status" aria-live="polite">
      {text ? (
        <p className="rounded-[28px] border-2 border-retry-border bg-retry-bg px-5 py-4 text-body text-retry-ink">
          {text}
        </p>
      ) : null}
    </div>
  );
}

export function AdultLoginForm({ action }: { action: LoginAction }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <Card>
      <form action={formAction} aria-labelledby="adult-title" className="flex flex-col gap-6">
        <h2 id="adult-title" className="text-subtitle">
          Professor ou terapeuta
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Message text={state.error} />
        <Button type="submit" variant="principal" icon={LogIn} disabled={pending}>
          Entrar
        </Button>
        <Link href="/esqueci-senha" className="text-label underline underline-offset-4">
          Esqueci minha senha
        </Link>
      </form>
    </Card>
  );
}

export function StudentLoginForm({ action }: { action: LoginAction }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <Card>
      <form action={formAction} aria-labelledby="student-title" className="flex flex-col gap-6">
        <h2 id="student-title" className="text-subtitle">
          Aluno
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="studentCode">Meu código</Label>
          <Input
            id="studentCode"
            name="studentCode"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABCD-2345"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pin">Meu PIN</Label>
          <Input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="off"
            required
          />
        </div>
        <Message text={state.error} />
        <Button type="submit" variant="principal" icon={LogIn} disabled={pending}>
          Entrar
        </Button>
      </form>
    </Card>
  );
}
