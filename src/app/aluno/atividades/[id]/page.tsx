import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { ActivityRunner } from "@/components/activity-runner";
import { NameRunner } from "@/components/name-runner";
import { buttonVariants } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { getPlayableActivity } from "@/lib/activities/queries";
import { idSchema } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";
import { finishSessionAction, recordAttemptAction, startSessionAction } from "../actions";

export default async function AtividadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");

  if (!idSchema.safeParse(id).success) notFound();
  const activity = await getPlayableActivity(session.user.id, id);
  if (!activity) notFound();

  const callbacks = { onStart: startSessionAction, onRecord: recordAttemptAction, onFinish: finishSessionAction };

  // Escrever o nome: o apelido sem nenhuma letra (ex.: só números) não dá para montar.
  if (activity.name === null) {
    return (
      <main className="flex flex-col gap-12">
        <h1>{activity.title}</h1>
        <Feedback tone="redirecionar" title="Vamos pedir ajuda">
          Peça ao seu professor para olhar esta atividade com você.
        </Feedback>
        <Link href="/aluno/atividades" className={cn(buttonVariants({ variant: "principal" }), "self-start")}>
          <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main>
      {/* Só dados simples e Server Actions cruzam para o cliente (nunca componentes). */}
      {activity.name ? (
        <NameRunner activityId={activity.id} title={activity.title} item={activity.name} {...callbacks} />
      ) : (
        <ActivityRunner
          activityId={activity.id}
          title={activity.title}
          items={activity.items}
          markerStyle={activity.markerStyle}
          {...callbacks}
        />
      )}
    </main>
  );
}
