import type { ImageRef } from "@/lib/validation/activities";
import { cn } from "@/lib/utils";

/**
 * Imagem enviada por um professor, servida pela nossa API autenticada (/api/imagens/[id]).
 * Não usa next/image de propósito: o otimizador do Next buscaria a imagem fora da sessão do usuário.
 * Tamanho contido (object-contain) e borda sutil: a figura nunca "pula" nem ocupa a tela toda.
 */
export function UploadedImage({ image, className }: { image: ImageRef; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver comentário acima
    <img
      src={`/api/imagens/${image.id}`}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      className={cn("h-auto max-w-full rounded-[12px] border-2 border-border-subtle bg-surface object-contain", className)}
    />
  );
}
