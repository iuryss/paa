/** @jest-environment node */
import { MAX_IMAGE_BYTES, parseImage } from "./format";

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const has = (data: Uint8Array, s: string) => Buffer.from(data).includes(Buffer.from(s, "latin1"));

// ───── Arquivos mínimos montados à mão (o leitor não confere CRC nem decodifica pixels) ─────

function pngChunk(type: string, data: number[] = []) {
  return [...be32(data.length), ...text(type), ...data, 0, 0, 0, 0];
}
function png(width: number, height: number, extra: number[][] = []) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...extra.flat(),
    ...pngChunk("IDAT", [1, 2, 3]),
    ...pngChunk("IEND"),
  ]);
}

function jpegSegment(marker: number, data: number[]) {
  const length = data.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...data];
}
function jpeg(width: number, height: number, extra: number[][] = []) {
  return new Uint8Array([
    0xff, 0xd8,
    ...jpegSegment(0xe0, text("JFIF\0")),
    ...extra.flat(),
    ...jpegSegment(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 1, 1, 0x11, 0]),
    ...jpegSegment(0xda, [1, 1, 0, 0, 0x3f, 0]),
    9, 9, 9, 0xff, 0xd9,
  ]);
}

function webpChunk(type: string, data: number[]) {
  return [...text(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}
function webp(width: number, height: number, { flags = 0, extra = [] as number[][] } = {}) {
  const vp8x = webpChunk("VP8X", [flags, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)]);
  const image = webpChunk("VP8L", [0x2f, 0, 0, 0, 0]);
  const body = [...text("WEBP"), ...vp8x, ...image, ...extra.flat()];
  return new Uint8Array([...text("RIFF"), ...le32(body.length), ...body]);
}

describe("parseImage", () => {
  it("PNG: mede e tira textos/EXIF (a localização some), mantendo a imagem", () => {
    const input = png(640, 480, [pngChunk("tEXt", text("GPS=-23.5,-46.6")), pngChunk("eXIf", text("Exif-gps"))]);
    const r = parseImage(input);
    if (!r.ok) throw new Error(r.problem);
    expect(r).toMatchObject({ mime: "image/png", width: 640, height: 480 });
    expect(has(r.data, "GPS")).toBe(false);
    expect(has(r.data, "Exif")).toBe(false);
    expect(has(r.data, "IDAT")).toBe(true);
    expect(has(r.data, "IEND")).toBe(true);
  });

  it("PNG animado (APNG) é recusado", () => {
    expect(parseImage(png(10, 10, [pngChunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0])]))).toEqual({ ok: false, problem: "animada" });
  });

  it("JPEG: mede pelo SOF e tira o EXIF (APP1) e comentários, mantendo JFIF e os dados", () => {
    const input = jpeg(800, 600, [jpegSegment(0xe1, text("Exif\0\0GPSLatitude")), jpegSegment(0xfe, text("Escola X"))]);
    const r = parseImage(input);
    if (!r.ok) throw new Error(r.problem);
    expect(r).toMatchObject({ mime: "image/jpeg", width: 800, height: 600 });
    expect(has(r.data, "GPSLatitude")).toBe(false);
    expect(has(r.data, "Escola X")).toBe(false);
    expect(has(r.data, "JFIF")).toBe(true);
    expect([...r.data.slice(-2)]).toEqual([0xff, 0xd9]);
  });

  it("WebP: mede, tira EXIF/XMP, limpa os avisos no cabeçalho e corrige o tamanho do RIFF", () => {
    const input = webp(1024, 768, { flags: 0x08 | 0x04, extra: [webpChunk("EXIF", text("GPS!")), webpChunk("XMP ", text("<x/>"))] });
    const r = parseImage(input);
    if (!r.ok) throw new Error(r.problem);
    expect(r).toMatchObject({ mime: "image/webp", width: 1024, height: 768 });
    expect(has(r.data, "GPS!")).toBe(false);
    expect(has(r.data, "XMP ")).toBe(false);
    expect(r.data[20]! & 0x0c).toBe(0); // flags do VP8X sem EXIF/XMP
    const riff = r.data[4]! | (r.data[5]! << 8) | (r.data[6]! << 16) | (r.data[7]! << 24);
    expect(riff).toBe(r.data.length - 8);
  });

  it("WebP animado é recusado", () => {
    expect(parseImage(webp(10, 10, { flags: 0x02 }))).toEqual({ ok: false, problem: "animada" });
  });

  it("recusa SVG, GIF, texto e arquivos cortados (o formato vem dos bytes, não do nome)", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(parseImage(svg)).toEqual({ ok: false, problem: "formato" });
    expect(parseImage(new Uint8Array(text("GIF89a......")))).toEqual({ ok: false, problem: "formato" });
    expect(parseImage(png(10, 10).slice(0, 40))).toEqual({ ok: false, problem: "formato" });
    expect(parseImage(jpeg(10, 10).slice(0, 12))).toEqual({ ok: false, problem: "formato" });
    expect(parseImage(new Uint8Array())).toEqual({ ok: false, problem: "formato" });
  });

  it("recusa grande demais e dimensões fora do limite", () => {
    expect(parseImage(new Uint8Array(MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, problem: "tamanho" });
    expect(parseImage(png(2001, 10))).toEqual({ ok: false, problem: "dimensoes" });
    expect(parseImage(png(0, 10))).toEqual({ ok: false, problem: "dimensoes" });
  });
});
