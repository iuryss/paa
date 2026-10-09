import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import type { LegalContext, LegalSection } from "@/content/legal";
import { cn } from "@/lib/utils";

interface LegalDocumentProps {
  title: string;
  subtitle: string;
  context: LegalContext;
  sections: LegalSection[];
}

export function LegalDocument({ title, subtitle, context, sections }: LegalDocumentProps) {
  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>{title}</h1>
        <p className="text-subtitle">{subtitle}</p>
        <p className="text-label text-ink-muted">Versão {context.version}</p>
      </header>

      {!context.reviewed ? (
        <Feedback tone="redirecionar" title="Versão de trabalho">
          Este texto ainda será revisado pelo jurídico da escola.
        </Feedback>
      ) : null}

      <Card className="flex flex-col gap-8">
        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-subtitle">{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="max-w-[70ch]">{p}</p>
            ))}
            {section.items ? (
              <ul className="list-disc space-y-1 pl-6">
                {section.items.map((item) => (
                  <li key={item} className="max-w-[70ch]">{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </Card>

      <Link href="/entrar" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
