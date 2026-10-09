import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { PreferencesPanel } from "@/components/preferences-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { roleHome } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export default async function PreferenciasPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) redirect("/entrar");
  const back = roleHome(session.user.role);

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Como você prefere ver?</h1>
        <p className="text-subtitle">Escolha o que fica melhor para você</p>
      </header>
      <Card>
        <PreferencesPanel />
      </Card>
      <Link href={back} className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
