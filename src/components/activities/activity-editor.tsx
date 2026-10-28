"use client";

import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ActivityRunner } from "@/components/activity-runner";
import { NameRunner } from "@/components/name-runner";
import { MarkerShape } from "@/components/marker-shape";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import {
  addAnswer,
  addStatement,
  DIRECTION_LABEL,
  EMPTY_SHEET,
  emptyItem,
  EXERCISE_LABEL,
  ICON_LABEL,
  MAX_ANSWERS,
  MAX_DISTRACTORS,
  MAX_ITEMS,
  MIN_ANSWERS,
  move,
  PIECE_ICONS,
  removeAnswer,
  toContent,
  toggleCorrect,
  validateItems,
  validateSheet,
  type SheetDraft,
  type EditorItem,
} from "@/lib/activities/editor-model";
import {
  DEFAULT_MARKER_STYLE,
  MARKER_STYLE_LABEL,
  MARKER_STYLES,
  markerFor,
  type MarkerStyle,
} from "@/lib/activities/markers";
import {
  buildNameItem,
  LETTER_CASE_LABEL,
  LETTER_CASES,
  MAX_EXTRA_LETTERS,
  MAX_NAME_LETTERS,
} from "@/lib/activities/name";
import { shuffleItemOptions } from "@/lib/activities/shuffle";
import { MODULE_LABEL } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";
import {
  contentSchemas,
  DIRECTIONS,
  EXERCISE_TYPES,
  MAX_EXAMPLE_TEXT,
  MAX_SHEET_EXERCISES,
  MAX_SHEET_TEXT,
  MAX_STATEMENTS,
  MAX_SUPPORT_TEXT,
  parseActivityContent,
  type SupportedModule,
} from "@/lib/validation/activities";

const SELECT_CLASS =
  "min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink disabled:bg-disabled-bg disabled:text-disabled-ink";

const TEXTAREA_CLASS =
  "w-full rounded-[20px] border-2 border-border bg-surface px-4 py-3 text-body text-ink disabled:bg-disabled-bg disabled:text-disabled-ink";

function IconSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: EditorItem["supportIcon"];
  onChange: (value: EditorItem["supportIcon"]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} className={SELECT_CLASS} onChange={(e) => onChange(e.target.value as EditorItem["supportIcon"])}>
        <option value="">Sem figura</option>
        {PIECE_ICONS.map((n) => (
          <option key={n} value={n}>{ICON_LABEL[n]}</option>
        ))}
      </select>
    </div>
  );
}

/** Na pré-visualização não há aluno: um apelido de exemplo, curto como os de verdade. */
const PREVIEW_NAME = "Sol";
const PREVIEW_CALLBACKS = {
  onStart: async () => ({ ok: false }) as const,
  onRecord: async () => ({ ok: false }),
  onFinish: async () => ({ ok: false }),
};

/** Escrever o nome: só a configuração (as letras vêm do apelido de cada aluno). */
function NameFields({
  id,
  item,
  onChange,
}: {
  id: string;
  item: EditorItem;
  onChange: (patch: Partial<EditorItem>) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-extra`}>Letras extras no quadro (para a criança escolher)</Label>
        <select
          id={`${id}-extra`}
          value={item.nameExtra}
          aria-describedby={`${id}-extra-hint`}
          className={SELECT_CLASS}
          onChange={(e) => onChange({ nameExtra: Number(e.target.value) })}
        >
          {Array.from({ length: MAX_EXTRA_LETTERS + 1 }, (_, n) => (
            <option key={n} value={n}>
              {n === 0 ? "Nenhuma (só as letras do nome)" : n}
            </option>
          ))}
        </select>
        <p id={`${id}-extra-hint`} className="text-label text-ink-muted">
          As extras nunca são letras do nome da criança, então só existe um jeito certo.
        </p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Letras</legend>
        {LETTER_CASES.map((letterCase) => (
          <label key={letterCase} className="flex items-center gap-3 text-body">
            <input
              type="radio"
              name={`${id}-case`}
              checked={item.nameCase === letterCase}
              onChange={() => onChange({ nameCase: letterCase })}
              className="size-6 shrink-0"
            />
            {LETTER_CASE_LABEL[letterCase]}
          </label>
        ))}
      </fieldset>
      <label className="flex items-start gap-3 text-body">
        <input
          type="checkbox"
          checked={item.nameModel}
          onChange={(e) => onChange({ nameModel: e.target.checked })}
          className="mt-1 size-6 shrink-0"
        />
        <span>
          Mostrar o nome como modelo desde o início
          <span className="block text-label text-ink-muted">
            Desmarcado, o modelo aparece quando a criança pede dica ou tenta duas letras diferentes.
          </span>
        </span>
      </label>
      <p className="text-label text-ink-muted">
        Cada aluno monta o próprio apelido, como está no cadastro. Nomes compostos mantêm o espaço; com mais de{" "}
        {MAX_NAME_LETTERS} letras, usamos só o primeiro nome.
      </p>
    </>
  );
}

/** Bloco de apoio da folha: a "leitura" da página, uma figura e um exemplo resolvido (tudo opcional). */
function SheetFields({
  uid,
  sheet,
  disabled,
  onChange,
}: {
  uid: string;
  sheet: SheetDraft;
  disabled: boolean;
  onChange: (patch: Partial<SheetDraft>) => void;
}) {
  return (
    <Card className="flex flex-col gap-6">
      <h2 className="text-subtitle">Leitura de apoio (aparece acima de todos os exercícios)</h2>
      <fieldset disabled={disabled} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-sheet-text`}>Texto de leitura (opcional)</Label>
          <textarea
            id={`${uid}-sheet-text`}
            rows={5}
            maxLength={MAX_SHEET_TEXT}
            value={sheet.text}
            aria-describedby={`${uid}-sheet-text-hint`}
            className={TEXTAREA_CLASS}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <p id={`${uid}-sheet-text-hint`} className="text-label text-ink-muted">
            Para destacar uma palavra, escreva entre dois asteriscos: **matéria**. ({sheet.text.length} de{" "}
            {MAX_SHEET_TEXT} letras)
          </p>
        </div>
        <IconSelect id={`${uid}-sheet-icon`} label="Figura da leitura" value={sheet.icon} onChange={(icon) => onChange({ icon })} />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-sheet-example`}>Exemplo resolvido (opcional)</Label>
          <textarea
            id={`${uid}-sheet-example`}
            rows={3}
            maxLength={MAX_EXAMPLE_TEXT}
            value={sheet.example}
            aria-describedby={`${uid}-sheet-example-hint`}
            className={TEXTAREA_CLASS}
            onChange={(e) => onChange({ example: e.target.value })}
          />
          <p id={`${uid}-sheet-example-hint`} className="text-label text-ink-muted">
            Um modelo já feito, como no papel: “Ex.: 2³ = 2 × 2 × 2 = 8”.
          </p>
        </div>
      </fieldset>
    </Card>
  );
}

/** Exercício da folha: apoio próprio (opcional) e as respostas ou frases, com a(s) certa(s) marcada(s). */
function ExerciseFields({
  id,
  item,
  onChange,
  onUpdate,
}: {
  id: string;
  item: EditorItem;
  onChange: (patch: Partial<EditorItem>) => void;
  onUpdate: (fn: (item: EditorItem) => EditorItem) => void;
}) {
  const setAnswer = (j: number, patch: Partial<EditorItem["answers"][number]>) =>
    onChange({ answers: item.answers.map((a, k) => (k === j ? { ...a, ...patch } : a)) });
  const setStatement = (j: number, patch: Partial<EditorItem["statements"][number]>) =>
    onChange({ statements: item.statements.map((s, k) => (k === j ? { ...s, ...patch } : s)) });
  const multi = item.exType === "marcar";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-support`}>Texto de apoio deste exercício (opcional)</Label>
        <textarea
          id={`${id}-support`}
          rows={2}
          maxLength={MAX_SUPPORT_TEXT}
          value={item.supportText}
          aria-describedby={`${id}-support-hint`}
          className={TEXTAREA_CLASS}
          onChange={(e) => onChange({ supportText: e.target.value })}
        />
        <p id={`${id}-support-hint`} className="text-label text-ink-muted">
          Mostrado só neste exercício ({item.supportText.length} de {MAX_SUPPORT_TEXT} letras).
        </p>
      </div>
      <IconSelect
        id={`${id}-support-icon`}
        label="Figura deste exercício"
        value={item.supportIcon}
        onChange={(supportIcon) => onChange({ supportIcon })}
      />

      {item.exType === "vf" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-label">Frases (de 1 a {MAX_STATEMENTS}): a criança diz se cada uma é verdadeira</legend>
          {item.statements.map((statement, j) => (
            <div key={j} role="group" aria-label={`Frase ${j + 1}`} className="flex flex-col gap-4 rounded-[20px] border-2 border-border bg-surface p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-s${j}`}>Texto da frase {j + 1}</Label>
                <Input id={`${id}-s${j}`} value={statement.text} maxLength={200} onChange={(e) => setStatement(j, { text: e.target.value })} />
              </div>
              <div role="radiogroup" aria-label={`A frase ${j + 1} é`} className="flex flex-wrap gap-6">
                {[true, false].map((value) => (
                  <label key={String(value)} className="flex items-center gap-3 text-body">
                    <input
                      type="radio"
                      name={`${id}-s${j}-correct`}
                      checked={statement.correct === value}
                      onChange={() => setStatement(j, { correct: value })}
                      className="size-6 shrink-0"
                    />
                    {value ? "Verdadeira" : "Falsa"}
                  </label>
                ))}
              </div>
              <Button
                icon={Trash2}
                className="self-start"
                disabled={item.statements.length <= 1}
                onClick={() => onChange({ statements: item.statements.filter((_, k) => k !== j) })}
              >
                Remover frase {j + 1}
              </Button>
            </div>
          ))}
          {item.statements.length < MAX_STATEMENTS ? (
            <Button icon={Plus} className="self-start" onClick={() => onUpdate(addStatement)}>
              Adicionar frase
            </Button>
          ) : null}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-1 text-label">
            Respostas (de {MIN_ANSWERS} a {MAX_ANSWERS}): {multi ? "marque todas as certas" : "marque a certa"}
          </legend>
          {item.answers.map((answer, j) => {
            const correct = multi ? item.correctSet.includes(j) : item.correctIndex === j;
            return (
              <div
                key={j}
                role="group"
                aria-label={`Resposta ${j + 1}`}
                className={cn(
                  "flex flex-col gap-4 rounded-[20px] border-2 p-4",
                  correct ? "border-success-border bg-success-bg" : "border-border bg-surface",
                )}
              >
                <label className="flex items-center gap-3 text-label">
                  <input
                    type={multi ? "checkbox" : "radio"}
                    name={`${id}-correct`}
                    checked={correct}
                    aria-label={`Resposta ${j + 1}: ${multi ? "esta vale" : "esta é a certa"}`}
                    onChange={() => (multi ? onUpdate((it) => toggleCorrect(it, j)) : onChange({ correctIndex: j }))}
                    className="size-6 shrink-0"
                  />
                  {multi ? "Esta vale" : "Esta é a certa"}
                </label>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-a${j}`}>Texto da resposta {j + 1}</Label>
                  <Input id={`${id}-a${j}`} value={answer.label} maxLength={40} onChange={(e) => setAnswer(j, { label: e.target.value })} />
                </div>
                <IconSelect
                  id={`${id}-a${j}-icon`}
                  label={`Figura da resposta ${j + 1}`}
                  value={answer.icon}
                  onChange={(icon) => setAnswer(j, { icon })}
                />
                <Button
                  icon={Trash2}
                  className="self-start"
                  disabled={item.answers.length <= MIN_ANSWERS}
                  onClick={() => onUpdate((it) => removeAnswer(it, j))}
                >
                  Remover resposta {j + 1}
                </Button>
              </div>
            );
          })}
          {item.answers.length < MAX_ANSWERS ? (
            <Button icon={Plus} className="self-start" onClick={() => onUpdate(addAnswer)}>
              Adicionar resposta
            </Button>
          ) : null}
        </fieldset>
      )}
    </>
  );
}

const DIFFICULTIES = [
  { value: "INICIAL", label: "Inicial" },
  { value: "INTERMEDIARIO", label: "Intermediário" },
  { value: "AVANCADO", label: "Avançado" },
] as const;
type DifficultyValue = (typeof DIFFICULTIES)[number]["value"];

const MARKER_STYLE_HELP: Record<MarkerStyle, string> = {
  CORES_E_FORMAS: "Cada resposta tem uma forma e uma cor. A dica diz as duas (“o triângulo amarelo”).",
  FORMAS: "Cada resposta tem uma forma, sem cor. A dica diz a forma (“o triângulo”).",
  CORES: "Todas as respostas têm um círculo, de cores diferentes. A dica diz a cor (“a cor azul”).",
};

interface ActivityEditorProps {
  module: SupportedModule;
  activityId?: string;
  initial: {
    title: string;
    instruction: string;
    difficulty: DifficultyValue;
    /** Ausente = padrão (cores e formas). */
    markerStyle?: MarkerStyle;
    published: boolean;
    items: EditorItem[];
    /** Só na folha: o bloco de apoio. */
    sheet?: SheetDraft;
  };
  /** Com sessões gravadas o conteúdo fica travado (os gráficos dos alunos dependem dele). */
  sessionCount?: number;
}

function DistractorList({
  idPrefix,
  label,
  values,
  disabled,
  onChange,
}: {
  idPrefix: string;
  label: string;
  values: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-label">{label}</legend>
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-3">
          <Input
            aria-label={`${label} ${i + 1}`}
            id={`${idPrefix}-${i}`}
            value={value}
            maxLength={40}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <Button
            variant="icone"
            icon={Trash2}
            aria-label={`Remover ${label.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {values.length < MAX_DISTRACTORS ? (
        <Button icon={Plus} className="self-start" onClick={() => onChange([...values, ""])}>
          Adicionar opção errada
        </Button>
      ) : null}
    </fieldset>
  );
}

export function ActivityEditor({ module, activityId, initial, sessionCount = 0 }: ActivityEditorProps) {
  const router = useRouter();
  const uid = useId();
  const locked = sessionCount > 0;

  const [title, setTitle] = useState(initial.title);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [difficulty, setDifficulty] = useState<DifficultyValue>(initial.difficulty);
  const [markerStyle, setMarkerStyle] = useState<MarkerStyle>(initial.markerStyle ?? DEFAULT_MARKER_STYLE);
  const [published, setPublished] = useState(initial.published);
  const [items, setItems] = useState<EditorItem[]>(initial.items);
  const [sheet, setSheet] = useState<SheetDraft>(initial.sheet ?? EMPTY_SHEET);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // 0 = fechada

  const patchItem = (index: number, patch: Partial<EditorItem>) =>
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  /** Valida tudo e devolve o conteúdo pronto, ou null (com as mensagens já exibidas). */
  function build(): unknown | null {
    const problems: string[] = [];
    if (!title.trim()) problems.push("Escreva o título da atividade.");
    if (!instruction.trim()) problems.push("Escreva a instrução curta (ex.: Toque no lado certo do mapa).");
    problems.push(...validateItems(module, items));
    if (module === "FOLHA") problems.push(...validateSheet(sheet));
    if (problems.length === 0) {
      const content = toContent(module, items, sheet);
      if (!contentSchemas[module].safeParse(content).success) {
        problems.push("Algum item tem dados inválidos. Revise as perguntas e as opções.");
      } else {
        setErrors([]);
        return content;
      }
    }
    setErrors(problems);
    setMessage(null);
    return null;
  }

  async function save() {
    const content = locked ? true : build();
    if (!content) return;
    if (locked && (!title.trim() || !instruction.trim())) {
      setErrors(["Escreva o título e a instrução da atividade."]);
      return;
    }
    setErrors([]);
    setSaving(true);
    setMessage(null);
    try {
      const base = { title, instruction, difficulty, markerStyle, published };
      const res = activityId
        ? await fetch(`/api/professor/atividades/${activityId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(locked ? base : { ...base, content }),
          })
        : await fetch("/api/professor/atividades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module, ...base, content }),
          });

      if (res.ok && !activityId) {
        const created = (await res.json()) as { id: string };
        router.push(`/professor/atividades/${created.id}`);
        return;
      }
      if (res.ok) {
        setMessage({ ok: true, text: published ? "Salvo. A atividade está publicada." : "Salvo como rascunho." });
        router.refresh();
      } else if (res.status === 409) {
        setMessage({ ok: false, text: "Esta atividade já tem sessões de alunos: o conteúdo não pode mudar. Crie uma cópia." });
      } else {
        setMessage({ ok: false, text: "Não foi possível salvar agora. Tente de novo." });
      }
    } catch {
      setMessage({ ok: false, text: "Não foi possível salvar agora. Tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!activityId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/professor/atividades/${activityId}/duplicar`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      router.push(`/professor/atividades/${((await res.json()) as { id: string }).id}`);
    } catch {
      setMessage({ ok: false, text: "Não foi possível criar a cópia agora." });
      setSaving(false);
    }
  }

  function togglePreview() {
    if (previewKey > 0) return setPreviewKey(0);
    if (build()) setPreviewKey(Date.now());
  }

  const preview = useMemo(() => {
    if (previewKey === 0) return null;
    const parsed = parseActivityContent(module, toContent(module, items, sheet));
    if (!parsed.success) return null;
    if (parsed.name) {
      const name = buildNameItem(PREVIEW_NAME, parsed.name);
      return name ? { name, items: [] } : null;
    }
    return { name: null, items: shuffleItemOptions(parsed.items), sheet: parsed.sheet };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só ao abrir a pré-visualização
  }, [previewKey]);
  const isName = module === "NOME";
  const isSheet = module === "FOLHA";
  const label = isSheet ? "Exercício" : "Item";

  return (
    <div className="flex flex-col gap-12">
      <Card className="flex flex-col gap-6">
        <h2 className="text-subtitle">Dados da atividade</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-title`}>Título</Label>
          <Input id={`${uid}-title`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-instruction`}>Instrução curta</Label>
          <Input
            id={`${uid}-instruction`}
            value={instruction}
            maxLength={120}
            aria-describedby={`${uid}-instruction-hint`}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <p id={`${uid}-instruction-hint`} className="text-label text-ink-muted">
            Um verbo por instrução. Ex.: “Toque no lado certo do mapa”.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-difficulty`}>Dificuldade</Label>
          <select
            id={`${uid}-difficulty`}
            value={difficulty}
            className={SELECT_CLASS}
            onChange={(e) => setDifficulty(e.target.value as DifficultyValue)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        {/* Escrever o nome não usa marcadores: a dica diz a letra e destaca a peça. */}
        {!isName ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-label">Marcadores das respostas e das dicas</legend>
          {MARKER_STYLES.map((style) => (
            <label
              key={style}
              className={cn(
                "flex items-start gap-4 rounded-[20px] border-2 px-4 py-3",
                markerStyle === style ? "border-primary-border bg-drop-active-bg" : "border-border bg-surface",
              )}
            >
              <input
                type="radio"
                name={`${uid}-marker-style`}
                value={style}
                checked={markerStyle === style}
                onChange={() => setMarkerStyle(style)}
                aria-labelledby={`${uid}-marker-${style}-name`}
                aria-describedby={`${uid}-marker-${style}`}
                className="mt-1 size-6 shrink-0"
              />
              <span className="flex flex-col gap-2">
                <span id={`${uid}-marker-${style}-name`} className="text-body">
                  {MARKER_STYLE_LABEL[style]}
                </span>
                <span aria-hidden="true" className="flex gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <MarkerShape key={i} marker={markerFor(i, style)} className="size-8" />
                  ))}
                </span>
                <span id={`${uid}-marker-${style}`} className="text-label text-ink-muted">
                  {MARKER_STYLE_HELP[style]}
                </span>
              </span>
            </label>
          ))}
          <p className="text-label text-ink-muted">
            No tema Foco Alto a criança sempre vê só as formas (o tema não usa cores).
          </p>
        </fieldset>
        ) : null}
        <label className="flex items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="size-6 shrink-0"
          />
          Publicada (aparece para atribuir aos alunos)
        </label>
      </Card>

      {locked ? (
        <Feedback tone="redirecionar" title="Conteúdo travado">
          Esta atividade já tem {sessionCount} {sessionCount === 1 ? "sessão" : "sessões"} de alunos. Mudar as perguntas
          bagunçaria os gráficos. Você ainda pode mudar o título e publicar. Para mudar o conteúdo, crie uma cópia.
        </Feedback>
      ) : null}

      {isSheet ? (
        <SheetFields uid={uid} sheet={sheet} disabled={locked} onChange={(patch) => setSheet((s) => ({ ...s, ...patch }))} />
      ) : null}

      <section aria-labelledby={`${uid}-items`} className="flex flex-col gap-6">
        <h2 id={`${uid}-items`} className="text-subtitle">
          {isName
            ? "Como a criança monta o nome"
            : isSheet
              ? `Exercícios (${items.length})`
              : `Itens de ${MODULE_LABEL[module]} (${items.length})`}
        </h2>
        <ol className="flex flex-col gap-6">
          {items.map((item, i) => {
            const id = `${uid}-i${i}`;
            const n = `${label} ${i + 1}`;
            return (
              <li key={i}>
                <Card className="flex flex-col gap-6" role="group" aria-label={isName ? "Configuração" : n}>
                  <div className={cn("flex flex-wrap items-center justify-between gap-3", isName && "hidden")}>
                    <h3 className="text-subtitle">
                      {n}
                      {isSheet ? <span className="block text-label text-ink-muted">{EXERCISE_LABEL[item.exType]}</span> : null}
                    </h3>
                    {!locked && !isName ? (
                      <div className="flex gap-3">
                        <Button variant="icone" icon={ArrowUp} aria-label={`Subir ${n.toLowerCase()}`} disabled={i === 0} onClick={() => setItems((l) => move(l, i, i - 1))} />
                        <Button variant="icone" icon={ArrowDown} aria-label={`Descer ${n.toLowerCase()}`} disabled={i === items.length - 1} onClick={() => setItems((l) => move(l, i, i + 1))} />
                        <Button variant="icone" icon={Trash2} aria-label={`Remover ${n.toLowerCase()}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} />
                      </div>
                    ) : null}
                  </div>

                  <fieldset disabled={locked} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-prompt`}>{isName ? "Pedido para a criança" : isSheet ? "Enunciado" : "Pergunta"}</Label>
                      <Input id={`${id}-prompt`} value={item.prompt} maxLength={120} onChange={(e) => patchItem(i, { prompt: e.target.value })} />
                    </div>
                    {!isName ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`${id}-hint`}>Dica (opcional)</Label>
                        <Input id={`${id}-hint`} value={item.hint} maxLength={120} onChange={(e) => patchItem(i, { hint: e.target.value })} />
                      </div>
                    ) : null}

                    {isName ? <NameFields id={id} item={item} onChange={(patch) => patchItem(i, patch)} /> : null}

                    {module === "LOCALIZACAO" ? (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`${id}-piece`}>Nome da peça</Label>
                          <Input id={`${id}-piece`} value={item.pieceLabel} maxLength={30} placeholder="Escola" onChange={(e) => patchItem(i, { pieceLabel: e.target.value })} />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`${id}-icon`}>Figura da peça</Label>
                          <select id={`${id}-icon`} value={item.pieceIcon} className={SELECT_CLASS} onChange={(e) => patchItem(i, { pieceIcon: e.target.value as EditorItem["pieceIcon"] })}>
                            <option value="">Sem figura</option>
                            {PIECE_ICONS.map((n) => (
                              <option key={n} value={n}>{ICON_LABEL[n]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`${id}-pos`}>Onde a peça fica no mapa (resposta certa)</Label>
                          <select id={`${id}-pos`} value={item.position} className={SELECT_CLASS} onChange={(e) => patchItem(i, { position: e.target.value as EditorItem["position"] })}>
                            {DIRECTIONS.map((d) => (
                              <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : null}

                    {module === "GRAFIA" ? (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`${id}-display`}>Letra mostrada (maiúscula)</Label>
                          <Input id={`${id}-display`} value={item.display} maxLength={3} placeholder="A" onChange={(e) => patchItem(i, { display: e.target.value })} />
                          <p className="text-label text-ink-muted">
                            A resposta certa é a minúscula:{" "}
                            <strong>{item.display.trim().toLowerCase() || "—"}</strong>
                          </p>
                        </div>
                        <DistractorList idPrefix={`${id}-d`} label="Opção errada" values={item.distractors} disabled={locked} onChange={(distractors) => patchItem(i, { distractors })} />
                      </>
                    ) : null}

                    {module === "MATEMATICA" ? (
                      <>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`${id}-a`}>Primeiro número (0 a 10)</Label>
                            <Input id={`${id}-a`} type="number" min={0} max={10} inputMode="numeric" value={item.a} onChange={(e) => patchItem(i, { a: Number(e.target.value) })} />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`${id}-b`}>Segundo número (0 a 10)</Label>
                            <Input id={`${id}-b`} type="number" min={0} max={10} inputMode="numeric" value={item.b} onChange={(e) => patchItem(i, { b: Number(e.target.value) })} />
                          </div>
                        </div>
                        <p className="text-label text-ink-muted">
                          A resposta certa é a soma: <strong>{item.a + item.b}</strong>.
                          {item.b === 0 ? " Com o segundo número 0, a criança só conta as maçãs." : ""}
                        </p>
                        <DistractorList idPrefix={`${id}-d`} label="Opção errada" values={item.distractors} disabled={locked} onChange={(distractors) => patchItem(i, { distractors })} />
                      </>
                    ) : null}

                    {isSheet ? (
                      <ExerciseFields
                        id={id}
                        item={item}
                        onChange={(patch) => patchItem(i, patch)}
                        onUpdate={(fn) => setItems((l) => l.map((it, k) => (k === i ? fn(it) : it)))}
                      />
                    ) : null}
                  </fieldset>
                </Card>
              </li>
            );
          })}
        </ol>
        {!locked && isSheet && items.length < MAX_SHEET_EXERCISES ? (
          <div role="group" aria-label="Adicionar exercício" className="flex flex-wrap gap-6">
            {EXERCISE_TYPES.map((type) => (
              <Button key={type} icon={Plus} onClick={() => setItems((l) => [...l, emptyItem(module, type)])}>
                {EXERCISE_LABEL[type]}
              </Button>
            ))}
          </div>
        ) : null}
        {!locked && !isName && !isSheet && items.length < MAX_ITEMS ? (
          <Button icon={Plus} className="self-start" onClick={() => setItems((l) => [...l, emptyItem(module)])}>
            Adicionar item
          </Button>
        ) : null}
      </section>

      <div role="status" aria-live="polite" className="flex flex-col gap-4">
        {errors.length > 0 ? (
          <Feedback announce={false} tone="redirecionar" title="Falta pouco!">
            <span className="block">Revise antes de continuar:</span>
            <ul className="list-disc pl-6">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Feedback>
        ) : null}
        {message ? (
          <Feedback announce={false} tone={message.ok ? "acerto" : "redirecionar"} title={message.ok ? "Pronto!" : "Quase!"}>
            {message.text}
          </Feedback>
        ) : null}
      </div>

      {preview ? (
        <section aria-label="Pré-visualização" className="flex flex-col gap-4">
          <Feedback tone="acerto" title="Modo de teste">
            Assim o aluno vê a atividade. Nada do que você responder aqui é gravado.
            {preview.name ? ` Aqui usamos o nome de exemplo “${PREVIEW_NAME}”: cada aluno vê o próprio apelido.` : ""}
          </Feedback>
          {preview.name ? (
            <NameRunner
              key={previewKey}
              activityId="preview"
              title={title || "Pré-visualização"}
              item={preview.name}
              {...PREVIEW_CALLBACKS}
              backHref="#"
            />
          ) : (
            <ActivityRunner
              key={previewKey}
              activityId="preview"
              title={title || "Pré-visualização"}
              items={preview.items}
              sheet={preview.sheet}
              markerStyle={markerStyle}
              {...PREVIEW_CALLBACKS}
              backHref="#"
            />
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-6">
        <Button variant="principal" icon={Save} onClick={save} disabled={saving}>
          Salvar
        </Button>
        {!locked ? (
          <Button icon={previewKey > 0 ? EyeOff : Eye} onClick={togglePreview}>
            {previewKey > 0 ? "Fechar pré-visualização" : "Pré-visualizar"}
          </Button>
        ) : null}
        {locked && activityId ? (
          <Button icon={Copy} onClick={duplicate} disabled={saving}>
            Criar cópia para editar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
