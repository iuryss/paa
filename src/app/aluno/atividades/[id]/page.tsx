import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ActivityRunner } from "@/components/activity-runner";
import { getPlayableActivity } from "@/lib/activities/queries";
import { idSchema } from "@/lib/validation/activities";
import { finishSessionAction, recordAttemptAction, startSessionAction } from "../actions";

export default async function AtividadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");

  if (!idSchema.safeParse(id).success) notFound();
  const activity = await getPlayableActivity(session.user.id, id);
  if (!activity) notFound();

  return (
    <main>
      {/* Só dados simples e Server Actions cruzam para o cliente (nunca componentes). */}
      <ActivityRunner
        activityId={activity.id}
        title={activity.title}
        items={activity.items}
        onStart={startSessionAction}
        onRecord={recordAttemptAction}
        onFinish={finishSessionAction}
      />
    </main>
  );
}
