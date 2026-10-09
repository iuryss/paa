"use client";

import { ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Label } from "@/components/ui/input";

interface AssignActivityFormProps {
  studentId: string;
  options: { id: string; title: string; moduleLabel: string }[];
}

export function AssignActivityForm({ studentId, options }: AssignActivityFormProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (options.length === 0) {
    return <p className="text-ink-muted">Todas as atividades publicadas já foram atribuídas.</p>;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activityId = new FormData(event.currentTarget).get("activityId");
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/professor/atribuicoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, studentId }),
      });
      if (res.ok) {
        setMessage({ ok: true, text: "Atividade atribuída." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: "Não foi possível atribuir agora." });
      }
    } catch {
      setMessage({ ok: false, text: "Não foi possível atribuir agora." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="activityId">Atividade</Label>
        <select
          id="activityId"
          name="activityId"
          required
          className="min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.moduleLabel})
            </option>
          ))}
        </select>
      </div>
      <div role="status" aria-live="polite">
        {message ? (
          <Feedback
            announce={false}
            tone={message.ok ? "acerto" : "redirecionar"}
            title={message.ok ? "Pronto!" : "Quase!"}
          >
            {message.text}
          </Feedback>
        ) : null}
      </div>
      <Button type="submit" icon={ListPlus} disabled={pending} className="self-start">
        Atribuir
      </Button>
    </form>
  );
}
