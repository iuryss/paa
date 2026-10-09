import Link from "next/link";
import { AcceptInvitationForm } from "@/components/account/accept-invitation-form";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isResetTokenValid } from "@/lib/accounts/password-reset";
import { cn } from "@/lib/utils";
import { resetPasswordAction } from "./actions";

export default async function RedefinirSenhaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!(await isResetTokenValid(token))) {
    return (
      <main className="flex flex-col gap-12">
        <h1>Link não encontrado</h1>
        <Card>
          <p>Este link não vale mais: ele pode ter vencido ou já ter sido usado.</p>
        </Card>
        <Link href="/esqueci-senha" className={cn(buttonVariants({ variant: "principal" }), "self-start")}>
          Pedir um novo link
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Crie uma nova senha</h1>
        <p className="text-subtitle">Escolha uma senha que só você conheça</p>
      </header>
      <Card>
        <AcceptInvitationForm
          action={resetPasswordAction.bind(null, token)}
          submitLabel="Salvar nova senha"
          passwordLabel="Nova senha"
        />
      </Card>
    </main>
  );
}
