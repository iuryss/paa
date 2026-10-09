import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { legalContext, termsSections } from "@/content/legal";

export const metadata: Metadata = { title: "Termo de consentimento - Plataforma TEA" };
export const dynamic = "force-dynamic";

export default function TermoPage() {
  const context = legalContext();
  return (
    <LegalDocument
      title="Termo de consentimento"
      subtitle="Para o responsável legal pela criança"
      context={context}
      sections={termsSections(context)}
    />
  );
}
