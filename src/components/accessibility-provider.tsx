"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Preferences } from "@/lib/validation/preferences";

type Persist = (prefs: Preferences) => Promise<unknown>;

interface AccessibilityValue {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  /** true se a última tentativa de salvar no servidor falhou (a tela já mudou localmente). */
  saveFailed: boolean;
}

const AccessibilityContext = createContext<AccessibilityValue | null>(null);

/** Espelha as preferências nos atributos do <html> que o CSS do design system lê. */
export function applyPreferences(root: HTMLElement, prefs: Preferences): void {
  root.dataset.theme = prefs.theme;
  root.dataset.mode = prefs.contentMode;
  root.dataset.font = prefs.font;
  root.dataset.motion = prefs.reducedMotion ? "reduce" : "auto";
}

interface ProviderProps {
  /** Vem do servidor (perfil sensorial salvo), para o primeiro paint já sair correto. */
  initial: Preferences;
  persist?: Persist;
  children: ReactNode;
}

export function AccessibilityProvider({ initial, persist, children }: ProviderProps) {
  const [prefs, setPrefs] = useState(initial);
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef(initial);

  useEffect(() => {
    applyPreferences(document.documentElement, prefs);
  }, [prefs]);

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      setPrefs(next);
      if (!persist) return;
      persist(next).then(
        (result) => setSaveFailed((result as { ok?: boolean } | undefined)?.ok === false),
        () => setSaveFailed(true),
      );
    },
    [persist],
  );

  const value = useMemo(() => ({ prefs, update, saveFailed }), [prefs, update, saveFailed]);

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility precisa estar dentro de <AccessibilityProvider>");
  return ctx;
}
