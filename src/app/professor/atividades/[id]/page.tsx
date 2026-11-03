import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { ActivityEditor } from "@/components/activities/activity-editor";
import { buttonVariants } from "@/components/ui/button";
import { getActivityForEdit } from "@/lib/activities/service";
import { MODULE_LABEL } from "@/lib/dashboard/metrics";
import { idSchema } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

export default async function EditarAtividadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  if (!idSchema.safeParse(id).success) notFound();

  const activity = await getActivityForEdit(session.user.id, id);
  if (!activity) notFound(); // não é sua (ou não existe): mesma resposta

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>{activity.title}</h1>
        <p className="text-subtitle">Atividade de {MODULE_LABEL[activity.module]}</p>
      </header>
      <ActivityEditor
        module={activity.module}
        activityId={activity.id}
        sessionCount={activity.sessionCount}
        initial={{
          title: activity.title,
          instruction: activity.instruction,
          difficulty: activity.difficulty,
          markerStyle: activity.markerStyle,
          published: activity.published,
          items: activity.items,
          sheet: activity.sheet,
        }}
      />
      <Link href="/professor/atividades" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
