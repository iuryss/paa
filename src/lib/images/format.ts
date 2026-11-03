/**
 * Leitura e limpeza de imagens enviadas pelos professores, sem bibliotecas nativas.
 * - O formato vem dos BYTES (assinatura), nunca do nome ou do Content-Type enviado.
 * - Só PNG, JPEG e WebP. SVG nunca (pode carregar script). GIF e imagens animadas também não:
 *   o design system proíbe movimento automático na tela da criança.
 * - Metadados saem antes de guardar (LGPD): EXIF (inclui GPS), XMP, IPTC, textos e comentários.
 */

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

/** Depois da compressão no navegador, uma imagem de atividade cabe folgada nisso. */
export const MAX_IMAGE_BYTES = 300 * 1024;
export const MAX_IMAGE_SIDE = 2000;

export type ImageProblem = "formato" | "animada" | "tamanho" | "dimensoes";

export type ParsedImage =
  | { ok: true; mime: ImageMime; width: number; height: number; data: Uint8Array }
  | { ok: false; problem: ImageProblem };

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32le = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ───────────── PNG ─────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Chunks de texto/metadados que saem. Os de imagem e cor ficam. */
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function parsePng(b: Uint8Array): ParsedImage {
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return { ok: false, problem: "formato" };
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  const kept: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let ended = false;
  while (i + 12 <= b.length) {
    const length = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + length;
    if (end > b.length) return { ok: false, problem: "formato" };
    if (type === "acTL") return { ok: false, problem: "animada" }; // APNG
    if (!PNG_DROP.has(type)) kept.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) return { ok: false, problem: "formato" };
  return { ok: true, mime: "image/png", width, height, data: concat(kept) };
}

// ───────────── JPEG ─────────────

/** SOF (tamanho da imagem): C0–CF, menos C4 (DHT), C8 (JPG) e CC (DAC). */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** APP0 (JFIF), APP2 (perfil de cor) e APP14 (Adobe, cor) ficam; os demais APPn e COM saem. */
const jpegKeeps = (m: number) => !((m >= 0xe1 && m <= 0xef && m !== 0xe2 && m !== 0xee) || m === 0xfe);

function parseJpeg(b: Uint8Array): ParsedImage {
  const kept: Uint8Array[] = [b.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return { ok: false, problem: "formato" };
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // byte de preenchimento
      continue;
    }
    const length = u16be(b, i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > b.length) return { ok: false, problem: "formato" };
    if (isSof(marker) && length >= 7) {
      height = u16be(b, i + 5);
      width = u16be(b, i + 7);
    }
    if (marker === 0xda) {
      // Início dos dados da imagem: o resto do arquivo (até o EOI) vai inteiro.
      kept.push(b.subarray(i));
      if (!width || !height) return { ok: false, problem: "formato" };
      return { ok: true, mime: "image/jpeg", width, height, data: concat(kept) };
    }
    if (jpegKeeps(marker)) kept.push(b.subarray(i, end));
    i = end;
  }
  return { ok: false, problem: "formato" };
}

// ───────────── WebP ─────────────

const WEBP_DROP = new Set(["EXIF", "XMP "]);
const VP8X_ANIMATION = 0x02;
const VP8X_XMP = 0x04;
const VP8X_EXIF = 0x08;

function parseWebp(b: Uint8Array): ParsedImage {
  if (b.length < 20 || ascii(b, 8, 4) !== "WEBP") return { ok: false, problem: "formato" };
  const chunks: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const end = i + 8 + size + (size % 2); // chunks têm tamanho par
    if (i + 8 + size > b.length) return { ok: false, problem: "formato" };
    const data = b.subarray(i + 8, i + 8 + size);
    if (type === "ANIM" || type === "ANMF") return { ok: false, problem: "animada" };
    if (type === "VP8X") {
      if (data[0]! & VP8X_ANIMATION) return { ok: false, problem: "animada" };
      width = u24le(data, 4) + 1;
      height = u24le(data, 7) + 1;
      // Sem os metadados, os avisos de "tem EXIF/XMP" também saem do cabeçalho.
      const header = b.slice(i, Math.min(end, b.length));
      header[8] = data[0]! & ~(VP8X_EXIF | VP8X_XMP);
      chunks.push(header);
    } else if (!WEBP_DROP.has(type)) {
      if (type === "VP8 " && !width && size >= 10) {
        width = (data[6]! | (data[7]! << 8)) & 0x3fff;
        height = (data[8]! | (data[9]! << 8)) & 0x3fff;
      }
      if (type === "VP8L" && !width && size >= 5 && data[0] === 0x2f) {
        const bits = u32le(data, 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      chunks.push(b.subarray(i, Math.min(end, b.length)));
    }
    i = end;
  }
  if (!width || !height) return { ok: false, problem: "formato" };
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 4), 0); // "RIFF"
  const riffSize = 4 + body.length;
  header.set([riffSize & 0xff, (riffSize >>> 8) & 0xff, (riffSize >>> 16) & 0xff, (riffSize >>> 24) & 0xff], 4);
  header.set(b.subarray(8, 12), 8); // "WEBP"
  return { ok: true, mime: "image/webp", width, height, data: concat([header, body]) };
}

/** Reconhece, mede e limpa a imagem. Qualquer coisa fora do esperado é recusada. */
export function parseImage(input: Uint8Array): ParsedImage {
  if (input.length === 0) return { ok: false, problem: "formato" };
  if (input.length > MAX_IMAGE_BYTES) return { ok: false, problem: "tamanho" };

  let parsed: ParsedImage;
  if (PNG_SIGNATURE.every((v, i) => input[i] === v)) parsed = parsePng(input);
  else if (input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) parsed = parseJpeg(input);
  else if (ascii(input, 0, 4) === "RIFF") parsed = parseWebp(input);
  else return { ok: false, problem: "formato" };

  if (!parsed.ok) return parsed;
  if (parsed.width < 1 || parsed.height < 1 || parsed.width > MAX_IMAGE_SIDE || parsed.height > MAX_IMAGE_SIDE) {
    return { ok: false, problem: "dimensoes" };
  }
  return parsed;
}

export const IMAGE_PROBLEM_TEXT: Record<ImageProblem, string> = {
  formato: "Use uma imagem PNG, JPG ou WebP.",
  animada: "Imagens animadas não são aceitas (nada se mexe sozinho na tela da criança).",
  tamanho: "A imagem ficou grande demais. Tente outra menor.",
  dimensoes: `A imagem pode ter no máximo ${MAX_IMAGE_SIDE} pixels de cada lado.`,
};
