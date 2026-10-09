import Link from "next/link";
import { LogIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex flex-col items-start gap-12">
      <header className="flex flex-col gap-2">
        <h1>Plataforma TEA</h1>
        <p className="text-subtitle">Aprender com calma, no seu tempo</p>
      </header>
      <Link href="/entrar" className={cn(buttonVariants({ variant: "principal" }))}>
        <LogIn aria-hidden="true" className="size-7" strokeWidth={2.5} />
        Entrar
      </Link>
    </main>
  );
}
