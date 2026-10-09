import Link from "next/link";
import { redirect } from "next/navigation";
import { ListChecks, LogOut, Minus, Settings, ShieldOff, TrendingDown, TrendingUp, Info, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { signOutAction } from "@/app/entrar/actions";
import { NewStudentForm } from "@/components/dashboard/new-student-form";
import { PeriodNav } from "@/components/dashboard/period-nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPercent, formatShortDate } from "@/lib/dashboard/format";
import { TREND_LABEL, type Trend } from "@/lib/dashboard/metrics";
import { getInactiveStudents, getStudentsOverview, parsePeriod } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";

const TREND_ICON: Record<Trend, typeof Minus> = {
  up: TrendingUp,
  steady: Minus,
  down: TrendingDown,
  insufficient: Info,
};

export default async function ProfessorPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  const days = parsePeriod((await searchParams).dias);
  const [students, inactive] = await Promise.all([
    getStudentsOverview(session.user.id, days),
    getInactiveStudents(session.user.id),
  ]);

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Painel do professor</h1>
        <p className="text-subtitle">Olá, {session.user.name}</p>
      </header>

      <section aria-labelledby="alunos" className="flex flex-col gap-6">
        <h2 id="alunos" className="text-subtitle">Seus alunos</h2>
        <PeriodNav current={days} basePath="/professor" />

        {students.length === 0 ? (
          <Card>
            <p>Você ainda não tem alunos. Cadastre o primeiro logo abaixo.</p>
          </Card>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2">
            {students.map(({ id, displayName, summary }) => {
              const TrendIcon = TREND_ICON[summary.trend];
              return (
                <li key={id}>
                  <Link
                    href={`/professor/alunos/${id}?dias=${days}`}
                    className="block rounded-[28px] focus-visible:outline-none"
                  >
                    <Card className="flex h-full flex-col gap-3">
                      <span className="text-subtitle">{displayName}</span>
                      <dl className="grid grid-cols-2 gap-3 text-label">
                        <div>
                          <dt className="text-ink-muted">Sessões</dt>
                          <dd className="text-body font-extrabold">{summary.sessions}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-muted">Autonomia</dt>
                          <dd className="text-body font-extrabold">
                            {summary.sessions > 0 ? formatPercent(summary.independence) : "—"}
                          </dd>
                        </div>
                      </dl>
                      <span className="flex items-center gap-2 text-label">
                        <TrendIcon aria-hidden="true" className="size-6 shrink-0" strokeWidth={2.5} />
                        {TREND_LABEL[summary.trend]}
                      </span>
                      <span className="text-label text-ink-muted">
                        {summary.lastSessionAt
                          ? `Última sessão: ${formatShortDate(summary.lastSessionAt)}`
                          : "Nenhuma sessão neste período"}
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inactive.length > 0 ? (
        <section aria-labelledby="desativados" className="flex flex-col gap-4">
          <h2 id="desativados" className="text-subtitle">Acesso desativado</h2>
          <p className="text-label text-ink-muted">
            Consentimento revogado: o acesso está bloqueado e os dados não são exibidos.
          </p>
          <ul className="flex flex-col gap-3">
            {inactive.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/professor/alunos/${s.id}`}
                  className={cn(buttonVariants({ variant: "secundaria" }), "w-full justify-start")}
                >
                  <ShieldOff aria-hidden="true" className="size-7" strokeWidth={2.5} />
                  {s.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <NewStudentForm />

      <div className="flex flex-wrap gap-6">
        <Link href="/professor/atividades" className={cn(buttonVariants({ variant: "secundaria" }))}>
          <ListChecks aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Atividades
        </Link>
        <Link href="/professor/conta" className={cn(buttonVariants({ variant: "secundaria" }))}>
          <UserRound aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Minha conta
        </Link>
        <Link href="/preferencias" className={cn(buttonVariants({ variant: "secundaria" }))}>
          <Settings aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Preferências
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
