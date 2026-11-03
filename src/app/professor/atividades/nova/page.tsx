import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Hash, Map, NotebookPen, PenLine, Type } from "lucide-react";
import { auth } from "@/auth";
import { ActivityEditor } from "@/components/activities/activity-editor";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { emptyItem } from "@/lib/activities/editor-model";
import { MODULE_LABEL } from "@/lib/dashboard/metrics";
import { isSupportedModule, type SupportedModule } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

const CHOICES: { module: SupportedModule; icon: React.ReactNode; text: string }[] = [
  { module: "LOCALIZACAO", icon: <Map aria-hidden="true" className="size-8" strokeWidth={2.5} />, text: "A criança diz em que lado do mapa fica uma peça (Norte, Sul, Leste, Oeste)." },
  { module: "GRAFIA", icon: <Type aria-hidden="true" className="size-8" strokeWidth={2.5} />, text: "A criança liga a letra maiúscula à sua minúscula." },
  { module: "MATEMATICA", icon: <Hash aria-hidden="true" className="size-8" strokeWidth={2.5} />, text: "A criança conta maçãs e resolve somas pequenas (0 a 10)." },
  { module: "FOLHA", icon: <NotebookPen aria-hidden="true" className="size-8" strokeWidth={2.5} />, text: "Como uma folha do caderno: um texto de apoio (com palavras em destaque e exemplo) e exercícios de escolha, marcar todas as certas e verdadeiro ou falso." },
  { module: "NOME", icon: <PenLine aria-hidden="true" className="size-8" strokeWidth={2.5} />, text: "A criança monta o próprio apelido arrastando (ou tocando) as letras na ordem certa. Uma atividade serve para todos os alunos." },
];

export default async function NovaAtividadePage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  const modulo = (await searchParams).modulo ?? "";

  if (!isSupportedModule(modulo)) {
    return (
      <main className="flex flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1>Nova atividade</h1>
          <p className="text-subtitle">Que tipo de atividade?</p>
        </header>
        <ul className="flex flex-col gap-6">
          {CHOICES.map((c) => (
            <li key={c.module}>
              <Link href={`/professor/atividades/nova?modulo=${c.module}`} className="block rounded-[28px]">
                <Card className="flex items-start gap-4">
                  {c.icon}
                  <span className="flex flex-col gap-1">
                    <span className="text-subtitle">{MODULE_LABEL[c.module]}</span>
                    <span className="text-label text-ink-muted">{c.text}</span>
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/professor/atividades" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
          <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
          Voltar
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1>Nova atividade de {MODULE_LABEL[modulo]}</h1>
      </header>
      <ActivityEditor
        module={modulo}
        initial={{ title: "", instruction: "", difficulty: "INICIAL", published: false, items: [emptyItem(modulo)] }}
      />
      <Link href="/professor/atividades" className={cn(buttonVariants({ variant: "secundaria" }), "self-start")}>
        <ArrowLeft aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Voltar
      </Link>
    </main>
  );
}
