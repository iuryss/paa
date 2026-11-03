"use client";

import { ImagePlus, Trash2, Upload, X } from "lucide-react";
import { useId, useState } from "react";
import { UploadedImage } from "@/components/uploaded-image";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import { IMAGE_PROBLEM_TEXT } from "@/lib/images/format";
import { ImagePrepareError, prepareImage } from "@/lib/images/compress";
import type { ImageRef } from "@/lib/validation/activities";

interface ImageFieldProps {
  id: string;
  label: string;
  value: ImageRef | null;
  onChange: (value: ImageRef | null) => void;
  /** Injetável nos testes (o jsdom não tem canvas). */
  prepare?: (file: File) => Promise<Blob>;
}

type Status = { ok: boolean; text: string } | null;

/**
 * Escolher uma imagem já enviada ou enviar uma nova. O envio exige descrever a imagem
 * (leitor de tela) e confirmar que ela NÃO mostra alunos (LGPD).
 */
export function ImageField({ id, label, value, onChange, prepare = prepareImage }: ImageFieldProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<(ImageRef & { width: number; height: number })[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function openPicker() {
    setOpen(true);
    setStatus(null);
    try {
      const res = await fetch("/api/professor/imagens");
      if (!res.ok) throw new Error(String(res.status));
      setLibrary(((await res.json()) as { images: (ImageRef & { width: number; height: number })[] }).images);
    } catch {
      setLibrary([]);
      setStatus({ ok: false, text: "Não foi possível abrir suas imagens agora." });
    }
  }

  function choose(image: ImageRef) {
    onChange({ id: image.id, alt: image.alt });
    setOpen(false);
  }

  async function upload() {
    if (!file) return setStatus({ ok: false, text: "Escolha um arquivo de imagem." });
    if (alt.trim().length < 3) return setStatus({ ok: false, text: "Descreva a imagem em poucas palavras." });
    if (!confirmed) return setStatus({ ok: false, text: "Confirme que a imagem não mostra alunos." });
    setBusy(true);
    setStatus(null);
    try {
      const blob = await prepare(file);
      const form = new FormData();
      form.append("arquivo", blob, "imagem");
      form.append("alt", alt.trim());
      form.append("confirmo", "sim");
      const res = await fetch("/api/professor/imagens", { method: "POST", body: form });
      const body = (await res.json()) as ImageRef & { message?: string };
      if (!res.ok) return setStatus({ ok: false, text: body.message ?? "Não foi possível enviar agora." });
      choose(body);
      setFile(null);
      setAlt("");
      setConfirmed(false);
    } catch (error) {
      const problem = error instanceof ImagePrepareError ? error.problem : null;
      setStatus({ ok: false, text: problem ? IMAGE_PROBLEM_TEXT[problem] : "Não foi possível enviar agora." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={label}>
      <span className="text-label">{label} (opcional)</span>
      {value ? (
        <div className="flex flex-col gap-3 rounded-[20px] border-2 border-border bg-surface p-4">
          <UploadedImage image={value} className="max-h-24 self-start" />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-alt`}>Descrição da imagem (para quem não enxerga)</Label>
            <Input id={`${id}-alt`} value={value.alt} maxLength={120} onChange={(e) => onChange({ ...value, alt: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button icon={ImagePlus} onClick={openPicker}>
              Trocar imagem
            </Button>
            <Button icon={Trash2} onClick={() => onChange(null)}>
              Tirar imagem
            </Button>
          </div>
        </div>
      ) : (
        <Button icon={ImagePlus} className="self-start" onClick={openPicker}>
          Escolher imagem
        </Button>
      )}

      {open ? (
        <section aria-label={`${label}: escolher`} className="flex flex-col gap-6 rounded-[20px] border-2 border-primary-border bg-surface p-4">
          <div className="flex flex-col gap-3">
            <h4 className="text-label">Minhas imagens</h4>
            {library === null ? (
              <p className="text-label text-ink-muted">Carregando…</p>
            ) : library.length === 0 ? (
              <p className="text-label text-ink-muted">Você ainda não enviou imagens.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                {library.map((image) => (
                  <li key={image.id}>
                    <button
                      type="button"
                      aria-label={`Usar: ${image.alt}`}
                      onClick={() => choose(image)}
                      className="flex min-h-target w-full flex-col items-center gap-2 rounded-[12px] border-2 border-border bg-surface p-2 text-label"
                    >
                      <UploadedImage image={image} className="max-h-20" />
                      <span aria-hidden="true">{image.alt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-label">Enviar nova imagem</h4>
            <Feedback announce={false} tone="redirecionar" title="Atenção (LGPD)">
              Não envie fotos de alunos, rostos, nomes ou documentos. Use imagens de objetos, desenhos, esquemas e
              gráficos.
            </Feedback>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-file`}>Arquivo (PNG, JPG ou WebP)</Label>
              <input
                id={`${uid}-file`}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="min-h-target text-body"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-new-alt`}>Descrição da imagem (para quem não enxerga)</Label>
              <Input id={`${uid}-new-alt`} value={alt} maxLength={120} placeholder="Ex.: cubo mágico colorido" onChange={(e) => setAlt(e.target.value)} />
            </div>
            <label className="flex items-start gap-3 text-body">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-6 shrink-0" />
              Confirmo que a imagem não mostra alunos, rostos, nomes ou documentos.
            </label>
            <div className="flex flex-wrap gap-3">
              {/* Secundário: na tela do editor a única ação principal é "Salvar". */}
              <Button icon={Upload} disabled={busy} onClick={upload}>
                {busy ? "Enviando…" : "Enviar imagem"}
              </Button>
              <Button icon={X} onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>

          {/* Só existe com o seletor aberto (é quando há mensagens): o editor não fica cheio de regiões vazias. */}
          <div role="status" aria-live="polite">
            {status ? (
              <Feedback announce={false} tone={status.ok ? "acerto" : "redirecionar"} title={status.ok ? "Pronto!" : "Quase!"}>
                {status.text}
              </Feedback>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
