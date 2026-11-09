import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Feedback } from "@/components/ui/feedback";
import { auth } from "@/auth";
import { BarList } from "@/components/charts/bar-list";
import { LineChart } from "@/components/charts/line-chart";
import { AssignActivityForm } from "@/components/dashboard/assign-activity-form";
import { PeriodNav } from "@/components/dashboard/period-nav";
import { PrintButton } from "@/components/dashboard/print-button";
import { ResetPinCard } from "@/components/dashboard/reset-pin-card";
import { StudentPrivacyCard } from "@/components/dashboard/student-privacy-card";
import { StudentProfileForm } from "@/components/dashboard/student-profile-form";
import { StudentTeamCard } from "@/components/dashboard/student-team-card";
import { loadPreferences } from "@/lib/preferences";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  describeChange,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatFullDateTime,
  formatPercent,
  formatSeconds,
  formatShortDate,
  type ChangeKind,
} from "@/lib/dashboard/format";
import {
  DIFFICULTY_LABEL,
  HELP_LABEL,
  MODULE_LABEL,
  TREND_LABEL,
  type Snapshot,
} from "@/lib/dashboard/metrics";
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

const HELP_LEVELS = ["NONE", "VERBAL_HINT", "VISUAL_HINT", "FULL_MODEL"] as const;

/** Tabela que pode rolar de lado: o contêiner recebe foco para rolar pelo teclado (WCAG 2.1.1). */
function DataTable({
  label,
  head,
  minWidth = 480,
  children,
}: {
  label: string;
  head: string[];
  minWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label={`Tabela: ${label}`}>
      <table className="w-full text-left text-label" style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((label, i) => (
              <th key={label} scope="col" className={i === head.length - 1 ? "pb-2" : "pb-2 pr-4"}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const cell = "py-2 pr-4";
const lastCell = "py-2";

function dateRange(s: Snapshot): string {
  const from = formatShortDate(s.from);
  const to = formatShortDate(s.to);
  return from === to ? from : `${from} a ${to}`;
}

const COMPARISON: { label: string; kind: ChangeKind; value: (s: Snapshot) => number }[] = [
  { label: "Autonomia", kind: "more", value: (s) => s.independence },
  { label: "Acertos nas tentativas", kind: "more", value: (s) => s.accuracy },
  { label: "Tempo até acertar", kind: "faster", value: (s) => s.avgItemMs },
  { label: "Sessões com ajuda do adulto", kind: "less", value: (s) => s.adultHelpShare },
];

function showValue(kind: ChangeKind, value: number): string {
  if (kind === "faster") return value > 0 ? formatSeconds(value) : "—";
  return formatPercent(value);
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

  const {
    student,
    sessions,
    interrupted,
    summary,
    byModule,
    byDifficulty,
    byActivity,
    weeks,
    engagement,
    startVsNow: comparison,
    assignable,
    assigned,
    team,
    otherAdults,
  } = report;
  const teamCard = (
    <StudentTeamCard
      studentId={student.id}
      displayName={student.displayName}
      currentAdultId={session.user.id}
      team={team}
      active={student.active}
    />
  );

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
        {teamCard}
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
        <p className="hidden text-label text-ink-muted print:block">
          Relatório gerado em {formatFullDateTime(new Date())} na Plataforma TEA.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <PeriodNav current={days} basePath={`/professor/alunos/${student.id}`} />
        <PrintButton />
      </div>

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

      <section aria-labelledby="inicio-agora" className="flex flex-col gap-4">
        <h2 id="inicio-agora" className="text-subtitle">Início × agora</h2>
        {comparison.status === "insufficient" ? (
          <p className="text-ink-muted">
            Para comparar o começo do uso com agora, são necessárias pelo menos {comparison.needed} sessões
            concluídas. Até agora: {comparison.total}.
          </p>
        ) : (
          <>
            <p className="text-label text-ink-muted">
              Compara as {comparison.start.sessions} primeiras sessões concluídas ({dateRange(comparison.start)}) com
              as {comparison.now.sessions} mais recentes ({dateRange(comparison.now)}). Vale desde o começo do uso e
              não depende do período escolhido. Total: {comparison.total} sessões concluídas.
            </p>
            <DataTable label="Início × agora" head={["Indicador", "No início", "Agora", "Mudança"]}>
              {COMPARISON.map(({ label, kind, value }) => {
                const start = value(comparison.start);
                const now = value(comparison.now);
                const change = describeChange(kind, start, now);
                return (
                  <tr key={label} className="border-t border-border-subtle">
                    <th scope="row" className={cell}>{label}</th>
                    <td className={cell}>{showValue(kind, start)}</td>
                    <td className={cell}>{showValue(kind, now)}</td>
                    <td className={lastCell}>{change ? `${change.text} (${change.reading})` : "—"}</td>
                  </tr>
                );
              })}
            </DataTable>
          </>
        )}
      </section>

      <Card className="flex flex-col gap-6">
        <h2 className="text-subtitle">Frequência nos últimos {days} dias</h2>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat label="Sessões concluídas" value={String(engagement.completed)} />
          <Stat label="Interrompidas" value={String(engagement.interrupted)} />
          <Stat
            label="Taxa de conclusão"
            value={engagement.completionRate === null ? "—" : formatPercent(engagement.completionRate)}
          />
          <Stat label="Sessões por semana" value={formatDecimal(engagement.sessionsPerWeek)} />
          <Stat label="Dias com uso" value={String(engagement.activeDays)} />
          <Stat
            label="Duração média da sessão"
            value={engagement.completed ? formatDuration(engagement.avgSessionMs) : "—"}
          />
        </dl>
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
          items={HELP_LEVELS.map((level) => ({
            label: HELP_LABEL[level],
            value: summary.helpDistribution[level],
          }))}
        />
        <LineChart
          title="Sessões sem ajuda, por semana"
          description="Parte das sessões da semana feitas sem nenhuma ajuda. Subir indica que o apoio está diminuindo."
          unit="percent"
          points={weeks.map((w) => ({
            label: formatShortDate(w.weekStart),
            detail: `Semana de ${formatShortDate(w.weekStart)} · ${w.sessions} ${w.sessions === 1 ? "sessão" : "sessões"}`,
            value: w.noHelpShare,
          }))}
        />
      </section>

      <section aria-labelledby="semanas" className="flex flex-col gap-4">
        <h2 id="semanas" className="text-subtitle">Ajuda por semana</h2>
        {weeks.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <DataTable label="Ajuda por semana" minWidth={640} head={["Semana de", "Sessões", ...HELP_LEVELS.map((l) => HELP_LABEL[l]), "Autonomia"]}>
            {weeks.map((w) => (
              <tr key={w.weekStart.getTime()} className="border-t border-border-subtle">
                <th scope="row" className={cell}>{formatShortDate(w.weekStart)}</th>
                <td className={cell}>{w.sessions}</td>
                {HELP_LEVELS.map((l) => (
                  <td key={l} className={cell}>{w.help[l]}</td>
                ))}
                <td className={lastCell}>{formatPercent(w.independence)}</td>
              </tr>
            ))}
          </DataTable>
        )}
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

      <section aria-labelledby="dificuldades" className="flex flex-col gap-4">
        <h2 id="dificuldades" className="text-subtitle">Por dificuldade</h2>
        {byDifficulty.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <DataTable label="Por dificuldade" head={["Dificuldade", "Sessões", "Autonomia", "Acertos", "Tempo até acertar"]}>
            {byDifficulty.map((d) => (
              <tr key={d.difficulty ?? "sem"} className="border-t border-border-subtle">
                <th scope="row" className={cell}>
                  {d.difficulty === null ? "Não registrada" : DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty}
                </th>
                <td className={cell}>{d.sessions}</td>
                <td className={cell}>{formatPercent(d.independence)}</td>
                <td className={cell}>{formatPercent(d.accuracy)}</td>
                <td className={lastCell}>{d.avgItemMs ? formatSeconds(d.avgItemMs) : "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>

      <section aria-labelledby="por-atividade" className="flex flex-col gap-4">
        <h2 id="por-atividade" className="text-subtitle">Por atividade</h2>
        {byActivity.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <>
            <p className="text-label text-ink-muted">
              Da menor autonomia para a maior: as primeiras são onde {student.displayName} mais precisa de apoio.
            </p>
            <DataTable
              label="Por atividade"
              minWidth={720}
              head={["Atividade", "Módulo", "Sessões", "Autonomia", "Acertos", "Tempo até acertar", "Última vez"]}
            >
              {byActivity.map((a) => (
                <tr key={`${a.module}|${a.title}`} className="border-t border-border-subtle">
                  <th scope="row" className={cell}>{a.title}</th>
                  <td className={cell}>{MODULE_LABEL[a.module] ?? a.module}</td>
                  <td className={cell}>{a.sessions}</td>
                  <td className={cell}>{formatPercent(a.independence)}</td>
                  <td className={cell}>{formatPercent(a.accuracy)}</td>
                  <td className={cell}>{a.avgItemMs ? formatSeconds(a.avgItemMs) : "—"}</td>
                  <td className={lastCell}>{formatShortDate(a.lastAt)}</td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </section>

      <section aria-labelledby="recentes" className="flex flex-col gap-4">
        <h2 id="recentes" className="text-subtitle">Últimas sessões</h2>
        {sessions.length === 0 ? (
          <p className="text-ink-muted">Ainda não há sessões neste período.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela: Últimas sessões">
            <table className="w-full min-w-[720px] text-left text-label">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-4">Quando</th>
                  <th scope="col" className="pb-2 pr-4">Atividade</th>
                  <th scope="col" className="pb-2 pr-4">Dificuldade</th>
                  <th scope="col" className="pb-2 pr-4">Duração</th>
                  <th scope="col" className="pb-2 pr-4">Tentativas</th>
                  <th scope="col" className="pb-2 pr-4">Autonomia</th>
                  <th scope="col" className="pb-2">Ajuda</th>
                </tr>
              </thead>
              <tbody>
                {[...sessions].reverse().slice(0, 10).map((s) => (
                  <tr key={s.id} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-4">{formatDateTime(s.startedAt)}</th>
                    <td className="py-2 pr-4">{s.activityTitle}</td>
                    <td className="py-2 pr-4">
                      {s.difficulty ? DIFFICULTY_LABEL[s.difficulty] ?? s.difficulty : "—"}
                    </td>
                    <td className="py-2 pr-4">{formatDuration(s.durationMs)}</td>
                    <td className="py-2 pr-4">{s.attempts}</td>
                    <td className="py-2 pr-4">{formatPercent(s.independence)}</td>
                    <td className="py-2">{HELP_LABEL[s.helpLevel]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="contents print:hidden">
        <StudentProfileForm
          studentId={student.id}
          displayName={student.displayName}
          initial={await loadPreferences(student.id)}
        />
      </div>

      {interrupted.length > 0 ? (
        <section aria-labelledby="interrompidas" className="flex flex-col gap-4">
          <h2 id="interrompidas" className="text-subtitle">Sessões interrompidas</h2>
          <p className="text-label text-ink-muted">
            {student.displayName} começou e não terminou (ou ficou 30 minutos sem responder). Esses dados são
            parciais e não entram nos gráficos de autonomia.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-label">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-4">Quando</th>
                  <th scope="col" className="pb-2 pr-4">Atividade</th>
                  <th scope="col" className="pb-2 pr-4">Tempo até parar</th>
                  <th scope="col" className="pb-2">Respostas dadas</th>
                </tr>
              </thead>
              <tbody>
                {interrupted.map((s) => (
                  <tr key={s.id} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-4">{formatDateTime(s.startedAt)}</th>
                    <td className="py-2 pr-4">{s.activityTitle}</td>
                    <td className="py-2 pr-4">{formatDuration(s.durationMs)}</td>
                    <td className="py-2">{s.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="contents print:hidden">
        {teamCard}

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
      </div>

      <section aria-labelledby="atribuidas" className="flex flex-col gap-4">
        <h2 id="atribuidas" className="text-subtitle">Atividades atribuídas</h2>
        {assigned.length === 0 ? (
          <p className="text-ink-muted">Nenhuma atividade atribuída ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-label">
              <thead>
                <tr>
                  <th scope="col" className="pb-2 pr-4">Atividade</th>
                  <th scope="col" className="pb-2 pr-4">Módulo</th>
                  <th scope="col" className="pb-2 pr-4">Atribuída por</th>
                  <th scope="col" className="pb-2">Quando</th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((a) => (
                  <tr key={a.id} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-4">{a.title}</th>
                    <td className="py-2 pr-4">{MODULE_LABEL[a.module] ?? a.module}</td>
                    <td className="py-2 pr-4">{a.assignedByYou ? "Você" : a.assignedByName}</td>
                    <td className="py-2">{formatShortDate(a.assignedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="contents print:hidden">
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
      </div>
    </main>
  );
}
