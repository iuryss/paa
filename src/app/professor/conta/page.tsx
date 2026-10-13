import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { InviteForm } from "@/components/account/invite-form";
import { SystemChecksCard } from "@/components/account/system-checks-card";
import { TestEmailButton } from "@/components/account/test-email-button";
import { buttonVariants } from "@/components/ui/button";
import { runSystemChecks } from "@/lib/system-checks";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  const checks = await runSystemChecks();

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Minha conta</h1>
        <p className="text-subtitle">{session.user.name}</p>
      </header>
      <ChangePasswordForm />
      <InviteForm />
      <section aria-labelledby="verificacao" className="flex flex-col gap-6">
        <h2 id="verificacao" className="sr-only">Verificação do sistema</h2>
        <SystemChecksCard checks={checks} />
        <TestEmailButton />
      </section>
      <Link href="/professor" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
