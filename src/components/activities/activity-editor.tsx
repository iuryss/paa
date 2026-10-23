"use client";

import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ActivityRunner } from "@/components/activity-runner";
import { MarkerShape } from "@/components/marker-shape";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import {
  DIRECTION_LABEL,
  emptyItem,
  ICON_LABEL,
  MAX_DISTRACTORS,
  MAX_ITEMS,
  move,
  PIECE_ICONS,
  toContent,
  validateItems,
  type EditorItem,
} from "@/lib/activities/editor-model";
import {
  DEFAULT_MARKER_STYLE,
  MARKER_STYLE_LABEL,
  MARKER_STYLES,
  markerFor,
  type MarkerStyle,
} from "@/lib/activities/markers";
import { shuffleItemOptions } from "@/lib/activities/shuffle";
import { MODULE_LABEL } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";
import {
  contentSchemas,
  DIRECTIONS,
  parseActivityContent,
  type SupportedModule,
} from "@/lib/validation/activities";

const SELECT_CLASS =
  "min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink disabled:bg-disabled-bg disabled:text-disabled-ink";

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
    if (problems.length === 0) {
      const content = toContent(module, items);
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

  const previewItems = useMemo(() => {
    if (previewKey === 0) return null;
    const parsed = parseActivityContent(module, toContent(module, items));
    return parsed.success ? shuffleItemOptions(parsed.items) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só ao abrir a pré-visualização
  }, [previewKey]);

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

      <section aria-labelledby={`${uid}-items`} className="flex flex-col gap-6">
        <h2 id={`${uid}-items`} className="text-subtitle">
          Itens de {MODULE_LABEL[module]} ({items.length})
        </h2>
        <ol className="flex flex-col gap-6">
          {items.map((item, i) => {
            const id = `${uid}-i${i}`;
            return (
              <li key={i}>
                <Card className="flex flex-col gap-6" role="group" aria-label={`Item ${i + 1}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-subtitle">Item {i + 1}</h3>
                    {!locked ? (
                      <div className="flex gap-3">
                        <Button variant="icone" icon={ArrowUp} aria-label={`Subir item ${i + 1}`} disabled={i === 0} onClick={() => setItems((l) => move(l, i, i - 1))} />
                        <Button variant="icone" icon={ArrowDown} aria-label={`Descer item ${i + 1}`} disabled={i === items.length - 1} onClick={() => setItems((l) => move(l, i, i + 1))} />
                        <Button variant="icone" icon={Trash2} aria-label={`Remover item ${i + 1}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))} />
                      </div>
                    ) : null}
                  </div>

                  <fieldset disabled={locked} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-prompt`}>Pergunta</Label>
                      <Input id={`${id}-prompt`} value={item.prompt} maxLength={120} onChange={(e) => patchItem(i, { prompt: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${id}-hint`}>Dica (opcional)</Label>
                      <Input id={`${id}-hint`} value={item.hint} maxLength={120} onChange={(e) => patchItem(i, { hint: e.target.value })} />
                    </div>

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
                  </fieldset>
                </Card>
              </li>
            );
          })}
        </ol>
        {!locked && items.length < MAX_ITEMS ? (
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

      {previewItems ? (
        <section aria-label="Pré-visualização" className="flex flex-col gap-4">
          <Feedback tone="acerto" title="Modo de teste">
            Assim o aluno vê a atividade. Nada do que você responder aqui é gravado.
          </Feedback>
          <ActivityRunner
            key={previewKey}
            activityId="preview"
            title={title || "Pré-visualização"}
            items={previewItems}
            markerStyle={markerStyle}
            onStart={async () => ({ ok: false })}
            onRecord={async () => ({ ok: false })}
            onFinish={async () => ({ ok: false })}
            backHref="#"
          />
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
