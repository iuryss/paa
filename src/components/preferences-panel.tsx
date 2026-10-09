"use client";

import { useId } from "react";
import { useAccessibility } from "@/components/accessibility-provider";
import {
  FONT_OPTIONS,
  MODE_OPTIONS,
  RadioGroup,
  THEME_OPTIONS,
  Toggle,
} from "@/components/ui/choice-controls";
import { Feedback } from "@/components/ui/feedback";

export function PreferencesPanel() {
  const { prefs, update, saveFailed } = useAccessibility();
  const uid = useId();

  return (
    <form className="flex flex-col gap-12" onSubmit={(e) => e.preventDefault()} aria-label="Preferências">
      <RadioGroup
        legend="Cores"
        name="theme"
        options={THEME_OPTIONS}
        value={prefs.theme}
        onChange={(theme) => update({ theme })}
      />
      <RadioGroup
        legend="Como mostrar"
        name="contentMode"
        options={MODE_OPTIONS}
        value={prefs.contentMode}
        onChange={(contentMode) => update({ contentMode })}
      />
      <RadioGroup
        legend="Letra"
        name="font"
        options={FONT_OPTIONS}
        value={prefs.font}
        onChange={(font) => update({ font })}
      />
      <div className="flex flex-col gap-6">
        <Toggle
          id={`${uid}-motion`}
          label="Sem movimento"
          checked={prefs.reducedMotion}
          onChange={(reducedMotion) => update({ reducedMotion })}
        />
        <Toggle
          id={`${uid}-sound`}
          label="Sons"
          checked={prefs.soundEnabled}
          onChange={(soundEnabled) => update({ soundEnabled })}
        />
      </div>
      {saveFailed ? (
        <Feedback tone="redirecionar" title="Quase!">
          Não deu para guardar agora. Tente de novo daqui a pouco.
        </Feedback>
      ) : null}
    </form>
  );
}
