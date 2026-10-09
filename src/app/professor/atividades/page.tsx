import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleCheck, FilePen, Plus } from "lucide-react";
import { auth } from "@/auth";
import { ActivityRowActions } from "@/components/activities/activity-row-actions";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShortDate } from "@/lib/dashboard/format";
import { MODULE_LABEL } from "@/lib/dashboard/metrics";
import { listActivitiesForAdult, type ActivityRow } from "@/lib/activities/service";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL = { INICIAL: "Inicial", INTERMEDIARIO: "Intermediário", AVANCADO: "Avançado" } as const;

function ActivityCard({ row, mine }: { row: ActivityRow; mine: boolean }) {
  const Status = row.published ? CircleCheck : FilePen;
  return (
    <li>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-subtitle">{row.title}</span>
          <span className="text-label text-ink-muted">
            {MODULE_LABEL[row.module] ?? row.module} · {DIFFICULTY_LABEL[row.difficulty]}
            {mine ? "" : ` · por ${row.authorName}`}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-6 gap-y-1 text-label">
          {/* Estado com ícone + palavra (cor nunca sozinha). */}
          <span className="flex items-center gap-2">
            <Status aria-hidden="true" className="size-5" strokeWidth={2.5} />
            {row.published ? "Publicada" : "Rascunho"}
          </span>
          {mine ? (
            <>
              <span>{row.assignments} {row.assignments === 1 ? "aluno" : "alunos"}</span>
              <span>{row.sessions} {row.sessions === 1 ? "sessão" : "sessões"}</span>
            </>
          ) : null}
          <span className="text-ink-muted">Atualizada em {formatShortDate(row.updatedAt)}</span>
        </p>
        <ActivityRowActions
          id={row.id}
          title={row.title}
          mine={mine}
          published={row.published}
          hasSessions={row.sessions > 0}
        />
      </Card>
    </li>
  );
}

export default async function AtividadesProfessorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  const { mine, library } = await listActivitiesForAdult(session.user.id);

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Atividades</h1>
        <p className="text-subtitle">Crie, publique e atribua aos alunos</p>
      </header>

      <Link href="/professor/atividades/nova" className={cn(buttonVariants({ variant: "principal" }), "self-start")}>
        <Plus aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Nova atividade
      </Link>

      <section aria-labelledby="minhas" className="flex flex-col gap-6">
        <h2 id="minhas" className="text-subtitle">Minhas atividades</h2>
        {mine.length === 0 ? (
          <Card><p>Você ainda não criou nenhuma atividade.</p></Card>
        ) : (
          <ul className="flex flex-col gap-6">
            {mine.map((row) => (
              <ActivityCard key={row.id} row={row} mine />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="biblioteca" className="flex flex-col gap-6">
        <h2 id="biblioteca" className="text-subtitle">Biblioteca da equipe</h2>
        <p className="text-label text-ink-muted">Atividades publicadas por colegas. Duplique para adaptar à sua turma.</p>
        {library.length === 0 ? (
          <Card><p>Ainda não há atividades de colegas.</p></Card>
        ) : (
          <ul className="flex flex-col gap-6">
            {library.map((row) => (
              <ActivityCard key={row.id} row={row} mine={false} />
            ))}
          </ul>
        )}
      </section>

      <Link href="/professor" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
