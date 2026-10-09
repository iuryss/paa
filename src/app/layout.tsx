import type { Metadata } from "next";
import { Andika, Atkinson_Hyperlegible, Nunito } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AccessibilityProvider } from "@/components/accessibility-provider";
import { DEFAULT_PREFERENCES, loadPreferences } from "@/lib/preferences";
import { savePreferencesAction } from "./preferencias/actions";
import "@/styles/tokens.css";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const andika = Andika({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-andika",
  display: "swap",
});
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-leitura",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Plataforma TEA",
  description: "Plataforma educacional adaptativa",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // O perfil sensorial é aplicado no servidor: o primeiro paint já sai com o tema da criança.
  const session = await auth();
  const prefs = session?.user?.id ? await loadPreferences(session.user.id) : DEFAULT_PREFERENCES;

  return (
    <html
      lang="pt-BR"
      data-theme={prefs.theme}
      data-mode={prefs.contentMode}
      data-font={prefs.font}
      data-motion={prefs.reducedMotion ? "reduce" : "auto"}
      className={`${nunito.variable} ${andika.variable} ${atkinson.variable}`}
    >
      <body>
        <AccessibilityProvider initial={prefs} persist={savePreferencesAction}>
          <a
            href="#conteudo"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[20px] focus:border-2 focus:border-primary-border focus:bg-primary focus:px-6 focus:py-4 focus:text-button focus:text-on-primary"
          >
            Ir para o conteúdo
          </a>
          <div id="conteudo" tabIndex={-1} className="mx-auto max-w-3xl p-4 sm:p-8">
            {children}
          </div>
          <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 pb-8 text-label sm:px-8">
            <Link href="/privacidade" className="underline underline-offset-4">Privacidade</Link>
            <Link href="/termo" className="underline underline-offset-4">Termo de consentimento</Link>
          </footer>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
