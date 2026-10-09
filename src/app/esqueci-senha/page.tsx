import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/account/forgot-password-form";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requestPasswordResetAction } from "./actions";

export default function EsqueciSenhaPage() {
  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Esqueci minha senha</h1>
        <p className="text-subtitle">Para professores e terapeutas</p>
      </header>
      <Card>
        <ForgotPasswordForm action={requestPasswordResetAction} />
      </Card>
      <p className="text-label text-ink-muted">
        Alunos: se esqueceu o PIN, peça ao seu professor para gerar um novo.
      </p>
      <Link href="/entrar" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
