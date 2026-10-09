"use client";

import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface ActivityRowActionsProps {
  id: string;
  title: string;
  /** Só o autor edita, publica e exclui. Colegas só duplicam. */
  mine: boolean;
  published: boolean;
  hasSessions: boolean;
}

export function ActivityRowActions({ id, title, mine, published, hasSessions }: ActivityRowActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, init: RequestInit, onOk: (res: Response) => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(String(res.status));
      await onOk(res);
    } catch {
      setError("Não foi possível concluir agora. Tente de novo.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const togglePublished = () =>
    call(
      `/api/professor/atividades/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !published }) },
      () => router.refresh(),
    );

  const duplicate = () =>
    call(`/api/professor/atividades/${id}/duplicar`, { method: "POST" }, async (res) => {
      router.push(`/professor/atividades/${((await res.json()) as { id: string }).id}`);
    });

  const remove = () =>
    call(`/api/professor/atividades/${id}`, { method: "DELETE" }, () => router.refresh());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {mine ? (
          <>
            <Link
              href={`/professor/atividades/${id}`}
              aria-label={`Editar ${title}`}
              className={cn(buttonVariants({ variant: "secundaria" }), "min-h-12 px-5 text-label")}
            >
              <Pencil aria-hidden="true" className="size-5" strokeWidth={2.5} />
              Editar
            </Link>
            <Button
              icon={published ? EyeOff : Eye}
              className="min-h-12 px-5 text-label"
              aria-label={`${published ? "Despublicar" : "Publicar"} ${title}`}
              disabled={busy}
              onClick={togglePublished}
            >
              {published ? "Despublicar" : "Publicar"}
            </Button>
          </>
        ) : null}
        <Button
          icon={Copy}
          className="min-h-12 px-5 text-label"
          aria-label={`Duplicar ${title}`}
          disabled={busy}
          onClick={duplicate}
        >
          Duplicar
        </Button>
        {mine && !hasSessions && !confirming ? (
          <Button
            icon={Trash2}
            className="min-h-12 px-5 text-label"
            aria-label={`Excluir ${title}`}
            onClick={() => setConfirming(true)}
          >
            Excluir
          </Button>
        ) : null}
      </div>

      {confirming ? (
        <div role="group" aria-label={`Confirmar exclusão de ${title}`} className="flex flex-col gap-3">
          <p className="text-body">Excluir “{title}”? Isso não pode ser desfeito.</p>
          <div className="flex gap-3">
            <Button variant="principal" icon={Trash2} className="min-h-12 text-label" disabled={busy} onClick={remove}>
              Sim, excluir
            </Button>
            <Button className="min-h-12 px-5 text-label" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {error ? <Feedback announce={false} tone="redirecionar" title="Quase!">{error}</Feedback> : null}
      </div>
    </div>
  );
}
