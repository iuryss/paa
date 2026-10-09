import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Feedback } from "@/components/ui/feedback";
import { roleHome } from "@/lib/rbac";
import { loginAdultAction, loginStudentAction } from "./actions";
import { AdultLoginForm, StudentLoginForm } from "./login-forms";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ cadastro?: string; senha?: string }>;
}) {
  // Quem já tem sessão VÁLIDA (conferida no banco) vai direto para a sua home.
  const session = await auth();
  if (session?.user?.id && session.user.role) redirect(roleHome(session.user.role));

  const params = await searchParams;
  return (
    <main className="flex flex-col gap-12">
      <h1>Entrar</h1>
      {params.cadastro === "ok" ? (
        <Feedback tone="acerto" title="Conta criada!">
          Agora entre com o seu e-mail e a senha que você escolheu.
        </Feedback>
      ) : null}
      {params.senha === "ok" ? (
        <Feedback tone="acerto" title="Senha alterada!">
          Agora entre com o seu e-mail e a nova senha.
        </Feedback>
      ) : null}
      <StudentLoginForm action={loginStudentAction} />
      <AdultLoginForm action={loginAdultAction} />
    </main>
  );
}
