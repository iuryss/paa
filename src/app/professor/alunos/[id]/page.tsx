import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Feedback } from "@/components/ui/feedback";
import { auth } from "@/auth";
import { BarList } from "@/components/charts/bar-list";
import { LineChart } from "@/components/charts/line-chart";
import { AssignActivityForm } from "@/components/dashboard/assign-activity-form";
import { PeriodNav } from "@/components/dashboard/period-nav";
import { ResetPinCard } from "@/components/dashboard/reset-pin-card";
import { StudentPrivacyCard } from "@/components/dashboard/student-privacy-card";
import { StudentProfileForm } from "@/components/dashboard/student-profile-form";
import { loadPreferences } from "@/lib/preferences";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDateTime,
  formatDuration,
  formatPercent,
  formatSeconds,
  formatShortDate,
} from "@/lib/dashboard/format";
import { HELP_LABEL, MODULE_LABEL, TREND_LABEL } from "@/lib/dashboard/metrics";
import { getStudentReport, parsePeriod } from "@/lib/dashboard/queries";
import { idSchema } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label text-ink-muted">{label}</dt>
      <dd className="text-subtitle">{value}</dd>
    </div>
  );
}

export default async function AlunoReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dias?: string | string[] }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  if (!idSchema.safeParse(id).success) notFound();

  const days = parsePeriod((await searchParams).dias);
  const report = await getStudentReport(session.user.id, id, days);
  if (!report) notFound(); // sem vínculo = não existe (não confirma que o aluno existe)

  const { student, sessions, summary, byModule, assignable, otherAdults } = report;

  // Consentimento revogado: nenhum dado de desempenho é exibido; só as opções de privacidade.
  if (!student.active) {
    return (
      <main className="flex flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1>{student.displayName}</h1>
          <p className="text-subtitle">Acesso desativado</p>
        </header>
        <Feedback tone="redirecionar" title="Consentimento revogado">
          O acesso da criança está bloqueado e os dados dela não são exibidos nem usados. Registre um novo
          consentimento para reativar, ou exclua os dados.
        </Feedback>
        <StudentPrivacyCard
          studentId={student.id}
          displayName={student.displayName}
          active={false}
          otherAdults={otherAdults}
        />
        <Link href="/professor" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
          <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Voltar
        </Link>
      </main>
    );
  }
  const point = (s: (typeof sessions)[number]) => ({
    label: formatShortDate(s.startedAt),
    detail: `${formatShortDate(s.startedAt)} · ${s.activityTitle}`,
  });

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>{student.displayName}</h1>
        <p className="text-subtitle">Evolução nos últimos {days} dias</p>
      </header>

      <PeriodNav current={days} basePath={`/professor/alunos/${student.id}`} />

      <Card>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Sessões" value={String(summary.sessions)} />
          <Stat label="Autonomia" value={summary.sessions ? formatPercent(summary.independence) : "—"} />
          <Stat label="Acertos nas tentativas" value={summary.sessions ? formatPercent(summary.accuracy) : "—"} />
          <Stat label="Tempo até acertar" value={summary.avgItemMs ? formatSeconds(summary.avgItemMs) : "—"} />
          <Stat label="Tempo total" value={formatDuration(summary.totalMs)} />
          <Stat label="Redirecionamentos" value={String(summary.redirects)} />
        </dl>
        <p className="mt-6 text-label text-ink-muted">{TREND_LABEL[summary.trend]}.</p>
      </Card>

      <section aria-labelledby="graficos" className="flex flex-col gap-12">
        <h2 id="graficos" className="sr-only">Gráficos de evolução</h2>
        <LineChart
          title="Autonomia por sessão"
          description="Itens resolvidos de primeira e sem ajuda. Quanto mais alto, mais autonomia."
          unit="percent"
          points={sessions.map((s) => ({ ...point(s), value: s.independence }))}
        />
        <LineChart
          title="Acertos nas tentativas"
          description="Respostas certas em relação a todas as tentativas da sessão."
          unit="percent"
          points={sessions.map((s) => ({ ...point(s), value: s.accuracy }))}
        />
        <LineChart
          title="Tempo médio até acertar cada item"
          description="Em segundos. Tempos menores costumam indicar mais segurança."
          unit="seconds"
          points={sessions
            .filter((s) => s.avgItemMs > 0)
            .map((s) => ({ ...point(s), value: s.avgItemMs / 1000 }))}
        />
        <BarList
          title="Nível de ajuda por sessão"
          description="Maior ajuda usada em cada sessão."
          items={(["NONE", "VERBAL_HINT", "VISUAL_HINT", "FULL_MODEL"] as const).map((level) => ({
            label: HELP_LABEL[level],
            value: summary.helpDistribution[level],
          }))}
        />
      </section>

      <section aria-labelledby="modulos" className="flex flex-col gap-4">
        <h2 id="modulos" className="text-subtitle">Por módulo</h2>
        {byModule.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-label">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-4">Módulo</th>
                  <th scope="col" className="pb-2 pr-4">Sessões</th>
                  <th scope="col" className="pb-2 pr-4">Autonomia</th>
                  <th scope="col" className="pb-2 pr-4">Acertos</th>
                  <th scope="col" className="pb-2">Tempo até acertar</th>
                </tr>
              </thead>
              <tbody>
                {byModule.map((m) => (
                  <tr key={m.module} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-4">{MODULE_LABEL[m.module] ?? m.module}</th>
                    <td className="py-2 pr-4">{m.sessions}</td>
                    <td className="py-2 pr-4">{formatPercent(m.independence)}</td>
                    <td className="py-2 pr-4">{formatPercent(m.accuracy)}</td>
                    <td className="py-2">{m.avgItemMs ? formatSeconds(m.avgItemMs) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="recentes" className="flex flex-col gap-4">
        <h2 id="recentes" className="text-subtitle">Últimas sessões</h2>
        {sessions.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-label">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-4">Quando</th>
                  <th scope="col" className="pb-2 pr-4">Atividade</th>
                  <th scope="col" className="pb-2 pr-4">Duração</th>
                  <th scope="col" className="pb-2 pr-4">Tentativas</th>
                  <th scope="col" className="pb-2">Ajuda</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-4">{formatDateTime(s.startedAt)}</th>
                    <td className="py-2 pr-4">{s.activityTitle}</td>
                    <td className="py-2 pr-4">{formatDuration(s.durationMs)}</td>
                    <td className="py-2 pr-4">{s.attempts}</td>
                    <td className="py-2">{HELP_LABEL[s.helpLevel]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StudentProfileForm
        studentId={student.id}
        displayName={student.displayName}
        initial={await loadPreferences(student.id)}
      />

      <ResetPinCard studentId={student.id} displayName={student.displayName} />

      <Card className="flex flex-col gap-4">
        <h2 className="text-subtitle">Atribuir atividade</h2>
        <AssignActivityForm
          studentId={student.id}
          options={assignable.map((a) => ({
            id: a.id,
            title: a.title,
            moduleLabel: MODULE_LABEL[a.module] ?? a.module,
          }))}
        />
      </Card>

      <StudentPrivacyCard
        studentId={student.id}
        displayName={student.displayName}
        active
        otherAdults={otherAdults}
      />

      <Link href="/professor" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
