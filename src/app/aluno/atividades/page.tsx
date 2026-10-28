import Link from "next/link";
import { ArrowLeft, Hash, Map, MessageCircleQuestion, NotebookPen, PenLine, Type } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listAssignedActivities } from "@/lib/activities/queries";
import { cn } from "@/lib/utils";

const MODULE_ICON = {
  LOCALIZACAO: <Map aria-hidden="true" className="size-7" strokeWidth={2.5} />,
  GRAFIA: <Type aria-hidden="true" className="size-7" strokeWidth={2.5} />,
  MATEMATICA: <Hash aria-hidden="true" className="size-7" strokeWidth={2.5} />,
  CIENCIAS: null,
  LIVRE: <MessageCircleQuestion aria-hidden="true" className="size-7" strokeWidth={2.5} />,
  FOLHA: <NotebookPen aria-hidden="true" className="size-7" strokeWidth={2.5} />,
  NOME: <PenLine aria-hidden="true" className="size-7" strokeWidth={2.5} />,
} as const;

export default async function AtividadesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  const activities = await listAssignedActivities(session.user.id);

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Escolha uma atividade</h1>
        <p className="text-subtitle">Uma de cada vez</p>
      </header>

      {activities.length === 0 ? (
        <Card>
          <p>Ainda não tem atividade por aqui. Chame o seu professor.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-6">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                href={`/aluno/atividades/${activity.id}`}
                className={cn(buttonVariants({ variant: "secundaria" }), "w-full justify-start")}
              >
                {MODULE_ICON[activity.module]}
                {activity.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/aluno" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
