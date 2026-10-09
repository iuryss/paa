import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { legalContext, privacySections } from "@/content/legal";

export const metadata: Metadata = { title: "Política de privacidade - Plataforma TEA" };
export const dynamic = "force-dynamic"; // lê o controlador e o contato do DPO da configuração do servidor

export default function PrivacidadePage() {
  const context = legalContext();
  return (
    <LegalDocument
      title="Política de privacidade"
      subtitle="Como cuidamos dos dados das crianças e dos profissionais"
      context={context}
      sections={privacySections(context)}
    />
  );
}
