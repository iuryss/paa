"use client";

import { Plus, Trash2 } from "lucide-react";
import { IconSelect, SELECT_CLASS, TEXTAREA_CLASS } from "@/components/activities/editor-controls";
import { ImageField } from "@/components/activities/image-field";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  addCard,
  addFigure,
  addGroup,
  addPair,
  addQuestion,
  ORDER_MODE_LABEL,
  orderPieces,
  removeGroup,
  type EditorItem,
} from "@/lib/activities/editor-model";
import {
  MAX_CARDS,
  MAX_EXTRA_WORDS,
  MAX_FIGURES,
  MAX_GROUPS,
  MAX_MARK_TEXT,
  MAX_NAME_EXTRAS,
  MAX_PAIRS,
  MAX_QUESTIONS,
  MIN_GROUPS,
  MIN_PAIRS,
  ORDER_MODES,
  parseGaps,
  parseMarkedWords,
} from "@/lib/validation/activities";

interface FieldProps {
  id: string;
  item: EditorItem;
  onChange: (patch: Partial<EditorItem>) => void;
  onUpdate: (fn: (item: EditorItem) => EditorItem) => void;
}

/** Palavras a mais no banco (lacunas e nomear). */
function ExtraWords({ item, max, onChange }: { item: EditorItem; max: number; onChange: (patch: Partial<EditorItem>) => void }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-label">Palavras extras no banco (opcional, até {max})</legend>
      {item.extras.map((word, j) => (
        <div key={j} className="flex items-center gap-3">
          <Input
            aria-label={`Palavra extra ${j + 1}`}
            value={word}
            maxLength={30}
            onChange={(e) => onChange({ extras: item.extras.map((w, k) => (k === j ? e.target.value : w)) })}
          />
          <Button
            variant="icone"
            icon={Trash2}
            aria-label={`Remover palavra extra ${j + 1}`}
            onClick={() => onChange({ extras: item.extras.filter((_, k) => k !== j) })}
          />
        </div>
      ))}
      {item.extras.length < max ? (
        <Button icon={Plus} className="self-start" onClick={() => onChange({ extras: [...item.extras, ""] })}>
          Adicionar palavra extra
        </Button>
      ) : null}
    </fieldset>
  );
}

/** Completar lacunas: a frase com [palavras] e as palavras extras do banco. */
function GapFields({ id, item, onChange }: FieldProps) {
  const { answers } = parseGaps(item.gapText);
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-gaps`}>Frase com lacunas</Label>
        <textarea
          id={`${id}-gaps`}
          rows={3}
          maxLength={400}
          value={item.gapText}
          aria-describedby={`${id}-gaps-hint`}
          className={TEXTAREA_CLASS}
          onChange={(e) => onChange({ gapText: e.target.value })}
        />
        <p id={`${id}-gaps-hint`} className="text-label text-ink-muted">
          Coloque entre colchetes as palavras que a criança vai encaixar: A matéria tem [massa] e [volume].
        </p>
        <p className="text-label text-ink" aria-live="polite">
          {answers.length > 0 ? `Lacunas (${answers.length}): ${answers.join(", ")}` : "Nenhuma lacuna ainda."}
        </p>
      </div>
      <ExtraWords item={item} max={MAX_EXTRA_WORDS} onChange={onChange} />
    </>
  );
}

/** Um lado do par: texto, figura e imagem (como as respostas). */
function PairSideFields({
  id,
  title,
  value,
  onChange,
}: {
  id: string;
  title: string;
  value: EditorItem["pairs"][number]["left"];
  onChange: (patch: Partial<EditorItem["pairs"][number]["left"]>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-label`}>{title}</Label>
        <Input id={`${id}-label`} value={value.label} maxLength={40} onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      <IconSelect id={`${id}-icon`} label={`Figura (${title.toLowerCase()})`} value={value.icon} onChange={(icon) => onChange({ icon })} />
      <ImageField id={`${id}-image`} label={`Imagem (${title.toLowerCase()})`} value={value.image} onChange={(image) => onChange({ image })} />
    </div>
  );
}

/** Ligar pares (um para um): a criança liga cada item da esquerda ao seu par da direita. */
function PairFields({ id, item, onChange, onUpdate }: FieldProps) {
  const setSide = (j: number, side: "left" | "right", patch: Partial<EditorItem["pairs"][number]["left"]>) =>
    onChange({ pairs: item.pairs.map((pr, k) => (k === j ? { ...pr, [side]: { ...pr[side], ...patch } } : pr)) });
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-label">
        Pares (de {MIN_PAIRS} a {MAX_PAIRS}): a coluna da direita aparece misturada para a criança
      </legend>
      {item.pairs.map((pair, j) => (
        <div key={j} role="group" aria-label={`Par ${j + 1}`} className="flex flex-col gap-4 rounded-[20px] border-2 border-border bg-surface p-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <PairSideFields id={`${id}-p${j}-l`} title={`Esquerda ${j + 1}`} value={pair.left} onChange={(patch) => setSide(j, "left", patch)} />
            <PairSideFields id={`${id}-p${j}-r`} title={`Direita ${j + 1}`} value={pair.right} onChange={(patch) => setSide(j, "right", patch)} />
          </div>
          <Button
            icon={Trash2}
            className="self-start"
            disabled={item.pairs.length <= MIN_PAIRS}
            onClick={() => onChange({ pairs: item.pairs.filter((_, k) => k !== j) })}
          >
            Remover par {j + 1}
          </Button>
        </div>
      ))}
      {item.pairs.length < MAX_PAIRS ? (
        <Button icon={Plus} className="self-start" onClick={() => onUpdate(addPair)}>
          Adicionar par
        </Button>
      ) : null}
    </fieldset>
  );
}

/** Colocar em ordem: o professor escreve na ordem certa; a tela mistura as peças. */
function OrderFields({ id, item, onChange }: FieldProps) {
  const pieces = orderPieces(item.orderMode, item.orderText);
  const steps = item.orderMode === "passos";
  return (
    <>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">O que a criança vai ordenar</legend>
        {ORDER_MODES.map((mode) => (
          <label key={mode} className="flex items-center gap-3 text-body">
            <input
              type="radio"
              name={`${id}-order`}
              checked={item.orderMode === mode}
              onChange={() => onChange({ orderMode: mode })}
              className="size-6 shrink-0"
            />
            {ORDER_MODE_LABEL[mode]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-order-text`}>Escreva na ordem certa</Label>
        <textarea
          id={`${id}-order-text`}
          rows={steps ? 5 : 2}
          maxLength={700}
          value={item.orderText}
          aria-describedby={`${id}-order-hint`}
          className={TEXTAREA_CLASS}
          onChange={(e) => onChange({ orderText: e.target.value })}
        />
        <p id={`${id}-order-hint`} className="text-label text-ink-muted">
          {steps ? "Um passo em cada linha, do primeiro ao último." : "A criança recebe as peças misturadas."}
        </p>
        <p className="text-label text-ink" aria-live="polite">
          {pieces.length > 0 ? `Peças (${pieces.length}): ${pieces.join(" · ")}` : "Nenhuma peça ainda."}
        </p>
      </div>
    </>
  );
}

/** Nomear imagens: cada figura com o nome certo, mais palavras extras para o banco. */
function FigureFields({ id, item, onChange, onUpdate }: FieldProps) {
  const setFigure = (j: number, patch: Partial<EditorItem["figures"][number]>) =>
    onChange({ figures: item.figures.map((f, k) => (k === j ? { ...f, ...patch } : f)) });
  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label">Figuras (de {MIN_PAIRS} a {MAX_FIGURES}): cada uma precisa de ícone ou imagem</legend>
        {item.figures.map((figure, j) => (
          <div key={j} role="group" aria-label={`Figura ${j + 1}`} className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-surface p-4">
            <IconSelect id={`${id}-f${j}-icon`} label={`Ícone da figura ${j + 1}`} value={figure.icon} onChange={(icon) => setFigure(j, { icon })} />
            <ImageField id={`${id}-f${j}-image`} label={`Imagem da figura ${j + 1}`} value={figure.image} onChange={(image) => setFigure(j, { image })} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-f${j}-answer`}>Nome certo da figura {j + 1}</Label>
              <Input id={`${id}-f${j}-answer`} value={figure.answer} maxLength={30} onChange={(e) => setFigure(j, { answer: e.target.value })} />
            </div>
            <Button
              icon={Trash2}
              className="self-start"
              disabled={item.figures.length <= MIN_PAIRS}
              onClick={() => onChange({ figures: item.figures.filter((_, k) => k !== j) })}
            >
              Remover figura {j + 1}
            </Button>
          </div>
        ))}
        {item.figures.length < MAX_FIGURES ? (
          <Button icon={Plus} className="self-start" onClick={() => onUpdate(addFigure)}>
            Adicionar figura
          </Button>
        ) : null}
      </fieldset>
      <ExtraWords item={item} max={MAX_NAME_EXTRAS} onChange={onChange} />
    </>
  );
}

/** Separar em grupos: as caixas e os cartões (cada cartão diz em qual caixa fica). */
function SortFields({ id, item, onChange, onUpdate }: FieldProps) {
  const setGroup = (j: number, patch: Partial<EditorItem["groups"][number]>) =>
    onChange({ groups: item.groups.map((g, k) => (k === j ? { ...g, ...patch } : g)) });
  const setCard = (j: number, patch: Partial<EditorItem["cards"][number]>) =>
    onChange({ cards: item.cards.map((c, k) => (k === j ? { ...c, ...patch } : c)) });
  return (
    <>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label">Caixas (de {MIN_GROUPS} a {MAX_GROUPS})</legend>
        {item.groups.map((group, j) => (
          <div key={j} role="group" aria-label={`Caixa ${j + 1}`} className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-surface p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-g${j}`}>Nome da caixa {j + 1}</Label>
              <Input id={`${id}-g${j}`} value={group.label} maxLength={40} onChange={(e) => setGroup(j, { label: e.target.value })} />
            </div>
            <IconSelect id={`${id}-g${j}-icon`} label={`Figura da caixa ${j + 1}`} value={group.icon} onChange={(icon) => setGroup(j, { icon })} />
            <ImageField id={`${id}-g${j}-image`} label={`Imagem da caixa ${j + 1}`} value={group.image} onChange={(image) => setGroup(j, { image })} />
            <Button
              icon={Trash2}
              className="self-start"
              disabled={item.groups.length <= MIN_GROUPS}
              onClick={() => onUpdate((it) => removeGroup(it, j))}
            >
              Remover caixa {j + 1}
            </Button>
          </div>
        ))}
        {item.groups.length < MAX_GROUPS ? (
          <Button icon={Plus} className="self-start" onClick={() => onUpdate(addGroup)}>
            Adicionar caixa
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-label">Cartões (de {MIN_PAIRS} a {MAX_CARDS}): aparecem misturados, um por vez</legend>
        {item.cards.map((card, j) => (
          <div key={j} role="group" aria-label={`Cartão ${j + 1}`} className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-surface p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-c${j}`}>Texto do cartão {j + 1}</Label>
              <Input id={`${id}-c${j}`} value={card.label} maxLength={40} onChange={(e) => setCard(j, { label: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-c${j}-group`}>Caixa certa do cartão {j + 1}</Label>
              <select
                id={`${id}-c${j}-group`}
                value={card.group}
                className={SELECT_CLASS}
                onChange={(e) => setCard(j, { group: Number(e.target.value) })}
              >
                {item.groups.map((group, k) => (
                  <option key={k} value={k}>
                    {group.label.trim() || `Caixa ${k + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <IconSelect id={`${id}-c${j}-icon`} label={`Figura do cartão ${j + 1}`} value={card.icon} onChange={(icon) => setCard(j, { icon })} />
            <ImageField id={`${id}-c${j}-image`} label={`Imagem do cartão ${j + 1}`} value={card.image} onChange={(image) => setCard(j, { image })} />
            <Button
              icon={Trash2}
              className="self-start"
              disabled={item.cards.length <= MIN_PAIRS}
              onClick={() => onChange({ cards: item.cards.filter((_, k) => k !== j) })}
            >
              Remover cartão {j + 1}
            </Button>
          </div>
        ))}
        {item.cards.length < MAX_CARDS ? (
          <Button icon={Plus} className="self-start" onClick={() => onUpdate(addCard)}>
            Adicionar cartão
          </Button>
        ) : null}
      </fieldset>
    </>
  );
}

/** Resposta em número: cada conta com a resposta certa; a prévia mostra a notação como a criança vê. */
function NumberFields({ id, item, onChange, onUpdate }: FieldProps) {
  const setQuestion = (j: number, patch: Partial<EditorItem["questions"][number]>) =>
    onChange({ questions: item.questions.map((q, k) => (k === j ? { ...q, ...patch } : q)) });
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-label">Contas (de 1 a {MAX_QUESTIONS}): uma por vez, com o teclado na tela</legend>
      <p className="text-label text-ink-muted">
        Escreva 2^3 para potência, 1/2 para fração e raiz(9) para raiz. Respostas equivalentes valem (1/2 = 0,5).
      </p>
      {item.questions.map((question, j) => (
        <div key={j} role="group" aria-label={`Conta ${j + 1}`} className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-surface p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-q${j}`}>Texto da conta {j + 1}</Label>
            <Input id={`${id}-q${j}`} value={question.expression} maxLength={60} placeholder="2^3" onChange={(e) => setQuestion(j, { expression: e.target.value })} />
            {question.expression.trim() ? (
              <p className="text-body text-ink">
                A criança vê: <MathText text={question.expression} /> = ?
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-q${j}-answer`}>Resposta certa da conta {j + 1}</Label>
            <Input id={`${id}-q${j}-answer`} value={question.answer} maxLength={12} placeholder="8" onChange={(e) => setQuestion(j, { answer: e.target.value })} />
          </div>
          <Button
            icon={Trash2}
            className="self-start"
            disabled={item.questions.length <= 1}
            onClick={() => onChange({ questions: item.questions.filter((_, k) => k !== j) })}
          >
            Remover conta {j + 1}
          </Button>
        </div>
      ))}
      {item.questions.length < MAX_QUESTIONS ? (
        <Button icon={Plus} className="self-start" onClick={() => onUpdate(addQuestion)}>
          Adicionar conta
        </Button>
      ) : null}
    </fieldset>
  );
}

/** Marcar no texto: o texto com as palavras certas entre [colchetes]. */
function MarkTextFields({ id, item, onChange }: FieldProps) {
  const right = parseMarkedWords(item.gapText).filter((w) => w.correct);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-mark`}>Texto com as palavras certas</Label>
      <textarea
        id={`${id}-mark`}
        rows={4}
        maxLength={MAX_MARK_TEXT}
        value={item.gapText}
        aria-describedby={`${id}-mark-hint`}
        className={TEXTAREA_CLASS}
        onChange={(e) => onChange({ gapText: e.target.value })}
      />
      <p id={`${id}-mark-hint`} className="text-label text-ink-muted">
        Coloque entre colchetes as palavras que a criança deve tocar: O [gelo] e o [vapor] são água.
      </p>
      <p className="text-label text-ink" aria-live="polite">
        {right.length > 0 ? `Palavras certas (${right.length}): ${right.map((w) => w.label).join(", ")}` : "Nenhuma palavra marcada ainda."}
      </p>
    </div>
  );
}

/** Os campos dos exercícios de encaixar, resposta em número e marcar no texto. */
export function PlaceFields(props: FieldProps) {
  switch (props.item.exType) {
    case "lacunas":
      return <GapFields {...props} />;
    case "ligar":
      return <PairFields {...props} />;
    case "ordenar":
      return <OrderFields {...props} />;
    case "nomear":
      return <FigureFields {...props} />;
    case "classificar":
      return <SortFields {...props} />;
    case "numero":
      return <NumberFields {...props} />;
    case "marcartexto":
      return <MarkTextFields {...props} />;
    default:
      return null;
  }
}
