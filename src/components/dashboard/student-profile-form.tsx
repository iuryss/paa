"use client";

import { Save } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FONT_OPTIONS,
  MODE_OPTIONS,
  RadioGroup,
  THEME_OPTIONS,
  Toggle,
} from "@/components/ui/choice-controls";
import { Feedback } from "@/components/ui/feedback";
import type { Preferences } from "@/lib/validation/preferences";

interface StudentProfileFormProps {
  studentId: string;
  displayName: string;
  initial: Preferences;
}

/**
 * Perfil sensorial DO ALUNO, definido pelo adulto que o acompanha.
 * Não usa o contexto de acessibilidade: o que o adulto escolhe aqui não muda a tela do próprio adulto.
 */
export function StudentProfileForm({ studentId, displayName, initial }: StudentProfileFormProps) {
  const uid = useId();
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const set = (patch: Partial<Preferences>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    setMessage(null);
  };

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/professor/alunos/${studentId}/perfil`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      setMessage(
        res.ok
          ? { ok: true, text: `O perfil de ${displayName} foi salvo. Vale a partir da próxima vez que entrar.` }
          : { ok: false, text: "Não foi possível salvar agora. Tente de novo." },
      );
    } catch {
      setMessage({ ok: false, text: "Não foi possível salvar agora. Tente de novo." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        aria-labelledby={`${uid}-title`}
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-2">
          <h2 id={`${uid}-title`} className="text-subtitle">Perfil sensorial</h2>
          <p className="text-label text-ink-muted">
            Como {displayName} vê a plataforma. A criança também pode ajustar em “Como eu vejo”.
          </p>
        </div>
        <RadioGroup legend="Cores" name={`${uid}-theme`} options={THEME_OPTIONS} value={prefs.theme} onChange={(theme) => set({ theme })} />
        <RadioGroup legend="Como mostrar" name={`${uid}-mode`} options={MODE_OPTIONS} value={prefs.contentMode} onChange={(contentMode) => set({ contentMode })} />
        <RadioGroup legend="Letra" name={`${uid}-font`} options={FONT_OPTIONS} value={prefs.font} onChange={(font) => set({ font })} />
        <div className="flex flex-col gap-6">
          <Toggle id={`${uid}-motion`} label="Sem movimento" checked={prefs.reducedMotion} onChange={(reducedMotion) => set({ reducedMotion })} />
          <Toggle id={`${uid}-sound`} label="Sons" checked={prefs.soundEnabled} onChange={(soundEnabled) => set({ soundEnabled })} />
        </div>
        <div role="status" aria-live="polite">
          {message ? (
            <Feedback announce={false} tone={message.ok ? "acerto" : "redirecionar"} title={message.ok ? "Pronto!" : "Quase!"}>
              {message.text}
            </Feedback>
          ) : null}
        </div>
        <Button type="submit" variant="principal" icon={Save} disabled={pending}>
          Salvar perfil
        </Button>
      </form>
    </Card>
  );
}
