/** @jest-environment node */
import { imageUploadSchema } from "@/lib/validation/images";
import { collectImageIds, deleteImage, findMissingImages, MAX_IMAGES_PER_ADULT, saveImage } from "./service";

const m = {
  count: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
  remove: jest.fn(),
  audit: jest.fn(),
  queryRaw: jest.fn(),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    image: {
      count: (...a: unknown[]) => m.count(...a),
      create: (...a: unknown[]) => m.create(...a),
      findMany: (...a: unknown[]) => m.findMany(...a),
      findFirst: (...a: unknown[]) => m.findFirst(...a),
      delete: (...a: unknown[]) => m.remove(...a),
    },
    auditLog: { create: (...a: unknown[]) => m.audit(...a) },
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => m.queryRaw(strings.join("?"), ...values),
  },
}));

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.audit.mockResolvedValue({});
});

/** PNG mínimo 4×3 com um texto de metadado (que tem de sumir). */
function pngWithText(): Uint8Array {
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type: string, data: number[] = []) => [...be32(data.length), ...Buffer.from(type), ...data, 0, 0, 0, 0];
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(4), ...be32(3), 8, 6, 0, 0, 0]),
    ...chunk("tEXt", [...Buffer.from("Author\0Escola")]),
    ...chunk("IDAT", [1]),
    ...chunk("IEND"),
  ]);
}

describe("saveImage", () => {
  it("guarda a imagem já sem metadados, com medidas e texto alternativo, e audita sem o conteúdo", async () => {
    m.count.mockResolvedValue(0);
    m.create.mockResolvedValue({ id: "cimg1234567890abcdefghij", alt: "Cubo mágico", width: 4, height: 3 });
    const r = await saveImage("prof1", pngWithText(), "Cubo mágico");
    expect(r).toEqual({ ok: true, image: { id: "cimg1234567890abcdefghij", alt: "Cubo mágico", width: 4, height: 3 } });
    const data = m.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ ownerId: "prof1", mime: "image/png", width: 4, height: 3, alt: "Cubo mágico" });
    expect(Buffer.from(data.data).includes(Buffer.from("Escola"))).toBe(false);
    expect(data.size).toBe(data.data.length);
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "prof1", action: "image.upload", targetId: "cimg1234567890abcdefghij" } });
  });

  it("recusa formato inválido sem tocar no banco", async () => {
    await expect(saveImage("prof1", Buffer.from("<svg/>"), "x")).resolves.toEqual({ ok: false, code: "invalid", problem: "formato" });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("respeita o limite de imagens por adulto", async () => {
    m.count.mockResolvedValue(MAX_IMAGES_PER_ADULT);
    await expect(saveImage("prof1", pngWithText(), "Cubo")).resolves.toEqual({ ok: false, code: "quota" });
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe("deleteImage", () => {
  it("só a dona apaga (os outros recebem 'não encontrada')", async () => {
    m.findFirst.mockResolvedValue(null);
    await expect(deleteImage("outro", "cimg")).resolves.toEqual({ ok: false, code: "not_found" });
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({ id: "cimg", ownerId: "outro" });
  });

  it("não apaga imagem usada em atividade (a figura sumiria da tela das crianças)", async () => {
    m.findFirst.mockResolvedValue({ id: "cimg" });
    m.queryRaw.mockResolvedValue([{ n: BigInt(2) }]);
    await expect(deleteImage("prof1", "cimg")).resolves.toEqual({ ok: false, code: "in_use", uses: 2 });
    expect(m.queryRaw.mock.calls[0]?.[1]).toBe("%cimg%");
    expect(m.remove).not.toHaveBeenCalled();
  });

  it("apaga a que não está em uso e audita", async () => {
    m.findFirst.mockResolvedValue({ id: "cimg" });
    m.queryRaw.mockResolvedValue([{ n: BigInt(0) }]);
    await expect(deleteImage("prof1", "cimg")).resolves.toEqual({ ok: true });
    expect(m.remove).toHaveBeenCalledWith({ where: { id: "cimg" } });
    expect(m.audit).toHaveBeenCalledWith({ data: { actorId: "prof1", action: "image.delete", targetId: "cimg" } });
  });
});

describe("imagens citadas numa atividade", () => {
  it("collectImageIds acha `image` e `supportImage`, em qualquer profundidade, sem repetir", () => {
    const content = {
      support: { text: "x", image: { id: "c1", alt: "a" } },
      items: [
        { supportImage: { id: "c3", alt: "c" }, options: [{ id: "o-1", image: { id: "c2", alt: "b" } }, { id: "o-2", image: { id: "c1", alt: "a" } }] },
        { id: "nao-e-imagem" },
      ],
    };
    expect(collectImageIds(content).sort()).toEqual(["c1", "c2", "c3"]);
    expect(collectImageIds(null)).toEqual([]);
  });

  it("findMissingImages devolve só as que não existem", async () => {
    m.findMany.mockResolvedValue([{ id: "c1" }]);
    await expect(findMissingImages(["c1", "c9"])).resolves.toEqual(["c9"]);
    await expect(findMissingImages([])).resolves.toEqual([]);
  });
});

describe("imageUploadSchema", () => {
  it("exige a confirmação de que não é foto de aluno e um texto alternativo", () => {
    expect(imageUploadSchema.safeParse({ alt: "Cubo mágico", confirmo: "sim" }).success).toBe(true);
    expect(imageUploadSchema.safeParse({ alt: "Cubo mágico", confirmo: null }).success).toBe(false);
    expect(imageUploadSchema.safeParse({ alt: "ab", confirmo: "sim" }).success).toBe(false);
    expect(imageUploadSchema.parse({ alt: "<b>Bola</b> de basquete", confirmo: "sim" }).alt).toBe("Bola de basquete");
  });
});
