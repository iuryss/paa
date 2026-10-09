import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Map, Play, Settings } from "lucide-react";
import { auth } from "@/auth";
import { AdaptiveLabel } from "@/components/adaptive-label";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOutAction } from "@/app/entrar/actions";
import { cn } from "@/lib/utils";

export default async function AlunoPage() {
  const session = await auth();
  // Sessão revogada (consentimento retirado / conta desativada): volta para a entrada.
  if (!session?.user?.id) redirect("/entrar");
  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Oi, {session.user.name}!</h1>
        <p className="text-subtitle">Vamos aprender?</p>
      </header>
      <Card className="flex items-center justify-center py-12 text-title">
        <AdaptiveLabel text="Onde fica?" icon={<Map />} />
      </Card>
      <Link href="/aluno/atividades" className={cn(buttonVariants({ variant: "principal" }), "self-start")}>
        <Play aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Atividades
      </Link>
      <div className="flex flex-wrap gap-6">
        <Link href="/preferencias" className={cn(buttonVariants({ variant: "secundaria" }))}>
          <Settings aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Como eu vejo
        </Link>
        <form action={signOutAction}>
          <Button type="submit" icon={LogOut}>
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
