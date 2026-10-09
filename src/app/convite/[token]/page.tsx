import Link from "next/link";
import { AcceptInvitationForm } from "@/components/account/accept-invitation-form";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getInvitationPreview } from "@/lib/accounts/invitations";
import { cn } from "@/lib/utils";
import { acceptInvitationAction } from "./actions";

const ROLE_LABEL = { TEACHER: "professor(a)", THERAPIST: "terapeuta", STUDENT: "aluno(a)" } as const;

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPreview(token);

  if (!invitation) {
    return (
      <main className="flex flex-col gap-12">
        <h1>Convite não encontrado</h1>
        <Card>
          <p>Este link não vale mais: ele pode ter vencido ou já ter sido usado. Peça um novo convite.</p>
        </Card>
        <Link href="/entrar" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
          Ir para a entrada
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Olá, {invitation.displayName}!</h1>
        <p className="text-subtitle">Crie sua conta de {ROLE_LABEL[invitation.role]}</p>
      </header>
      <Card>
        {/* Só o token (texto) e uma Server Action cruzam para o cliente. */}
        <AcceptInvitationForm action={acceptInvitationAction.bind(null, token)} />
      </Card>
    </main>
  );
}
