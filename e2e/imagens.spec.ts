import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { OTHER_TEACHER, prisma, resetAndSeed, STUDENT, TEACHER, type Seeded } from "./helpers/data";
import { loginAdult, loginStudent, option } from "./helpers/ui";

let seed: Seeded;
test.beforeAll(async () => {
  seed = await resetAndSeed();
});
test.afterAll(() => prisma.$disconnect());

/** PNG real (válido, com CRC e compressão), para o navegador decodificar e comprimir. */
function realPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xc8)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = realPng(40, 30);

/** JPEG mínimo com EXIF contendo "GPSLatitude" (o servidor precisa apagar). */
function jpegWithGps(): Buffer {
  const seg = (marker: number, data: number[]) => {
    const n = data.length + 2;
    return [0xff, marker, (n >> 8) & 0xff, n & 0xff, ...data];
  };
  return Buffer.from([
    0xff, 0xd8,
    ...seg(0xe0, [...Buffer.from("JFIF\0")]),
    ...seg(0xe1, [...Buffer.from("Exif\0\0GPSLatitude=-23.55")]),
    ...seg(0xc0, [8, 0, 10, 0, 10, 1, 1, 0x11, 0]),
    ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
    1, 2, 3, 0xff, 0xd9,
  ]);
}

test("professor envia uma imagem pelo editor (comprimida no navegador) e o aluno a vê na atividade", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  await page.goto("/professor/atividades/nova?modulo=FOLHA");
  await page.getByLabel("Título").fill("Formas do dia a dia");
  await page.getByLabel("Instrução curta").fill("Olhe e escolha");

  const ex1 = page.getByRole("group", { name: "Exercício 1" });
  await ex1.getByLabel("Enunciado").fill("Qual objeto é redondo?");
  await ex1.getByLabel("Texto da resposta 1").fill("Bola");
  await ex1.getByLabel("Texto da resposta 2").fill("Dado");

  // Envio pela tela, como o professor faria.
  const field = ex1.getByRole("group", { name: "Imagem da resposta 1" });
  await field.getByRole("button", { name: "Escolher imagem" }).click();
  await expect(field.getByText("Você ainda não enviou imagens.")).toBeVisible();
  await expect(field.getByText(/Não envie fotos de alunos/)).toBeVisible();
  await field.getByLabel("Arquivo (PNG, JPG ou WebP)").setInputFiles({ name: "bola.png", mimeType: "image/png", buffer: PNG });
  await field.getByLabel("Descrição da imagem (para quem não enxerga)").fill("Bola de basquete");
  await field.getByRole("checkbox", { name: /não mostra alunos/ }).check();
  await field.getByRole("button", { name: "Enviar imagem" }).click();
  await expect(field.getByRole("img", { name: "Bola de basquete" })).toBeVisible();

  const stored = await prisma.image.findFirst({ where: { ownerId: seed.teacherId } });
  expect(stored).toMatchObject({ alt: "Bola de basquete", width: 40, height: 30 });
  expect(["image/webp", "image/jpeg"]).toContain(stored!.mime); // regravada no navegador

  await page.getByLabel(/Publicada/).check();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/professor\/atividades\/[A-Za-z0-9]+$/);
  const activity = await prisma.activity.findFirst({ where: { title: "Formas do dia a dia" } });
  const options = (activity!.content as { items: { options: { image?: { id: string } }[] }[] }).items[0]!.options;
  expect(options[0]!.image).toEqual({ id: stored!.id, alt: "Bola de basquete" });

  // O aluno joga e a imagem carrega de verdade (servida pela API, com a sessão dele).
  await prisma.assignment.create({ data: { activityId: activity!.id, studentId: seed.studentId, assignedBy: seed.teacherId } });
  const ctx = await browser.newContext();
  const kid = await ctx.newPage();
  await loginStudent(kid, STUDENT.code, STUDENT.pin);
  await kid.goto(`/aluno/atividades/${activity!.id}`);
  const img = option(kid, "Bola").locator("img");
  await expect(img).toHaveAttribute("src", `/api/imagens/${stored!.id}`);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await option(kid, "Bola").click();
  await expect(kid.getByRole("status").filter({ hasText: "Isso!" })).toBeVisible();
  await ctx.close();
});

test("segurança das imagens: login, papel, formato, metadados e exclusão", async ({ page, browser }) => {
  await loginAdult(page, TEACHER.email, TEACHER.password);
  const upload = (buffer: Buffer, name: string, mimeType: string, extra: Record<string, string> = { alt: "Teste", confirmo: "sim" }) =>
    page.request.post("/api/professor/imagens", { multipart: { arquivo: { name, mimeType, buffer }, ...extra } });

  // SVG disfarçado de PNG (nome e tipo mentem): recusado pelos bytes.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const fake = await upload(svg, "inocente.png", "image/png");
  expect(fake.status()).toBe(422);

  // Sem confirmar que não é foto de aluno: recusado.
  expect((await upload(jpegWithGps(), "foto.jpg", "image/jpeg", { alt: "Foto" })).status()).toBe(422);

  // JPEG com GPS no EXIF: aceito, mas o GPS some antes de guardar.
  const ok = await upload(jpegWithGps(), "foto.jpg", "image/jpeg");
  expect(ok.status()).toBe(201);
  const { id } = (await ok.json()) as { id: string };
  const served = await page.request.get(`/api/imagens/${id}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await served.body()).includes(Buffer.from("GPSLatitude"))).toBe(false);

  // Sem login: 401. Aluno não envia: 403 (mas vê, porque as atividades usam as imagens).
  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/imagens/${id}`)).status()).toBe(401);
  await anon.close();
  const kidCtx = await browser.newContext();
  const kid = await kidCtx.newPage();
  await loginStudent(kid, STUDENT.code, STUDENT.pin);
  expect((await kid.request.get(`/api/imagens/${id}`)).status()).toBe(200);
  const kidUpload = await kid.request.post("/api/professor/imagens", {
    multipart: { arquivo: { name: "a.png", mimeType: "image/png", buffer: PNG }, alt: "x", confirmo: "sim" },
  });
  expect(kidUpload.status()).toBe(403);
  await kidCtx.close();

  // Imagem em uso não pode ser apagada; outro professor não apaga a de ninguém.
  await prisma.activity.create({
    data: {
      module: "FOLHA",
      title: "Usa a foto",
      instruction: "x",
      authorId: seed.teacherId,
      content: {
        items: [
          {
            type: "escolha",
            key: "item-1",
            prompt: "?",
            supportImage: { id, alt: "Teste" },
            options: [
              { id: "o-a", label: "A" },
              { id: "o-b", label: "B" },
            ],
            correctId: "o-a",
          },
        ],
      },
    },
  });
  const inUse = await page.request.delete(`/api/professor/imagens/${id}`);
  expect(inUse.status()).toBe(409);

  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await loginAdult(other, OTHER_TEACHER.email, OTHER_TEACHER.password);
  expect((await other.request.delete(`/api/professor/imagens/${id}`)).status()).toBe(404);
  await otherCtx.close();

  // Atividade citando imagem inexistente não é salva.
  const bad = await page.request.post("/api/professor/atividades", {
    data: {
      module: "FOLHA",
      title: "Imagem fantasma",
      instruction: "x",
      content: {
        items: [
          {
            type: "escolha",
            key: "item-1",
            prompt: "?",
            supportImage: { id: "cnaoexiste1234567890abcd", alt: "Fantasma" },
            options: [
              { id: "o-a", label: "A" },
              { id: "o-b", label: "B" },
            ],
            correctId: "o-a",
          },
        ],
      },
    },
  });
  expect(bad.status()).toBe(422);
  expect(await bad.json()).toMatchObject({ error: "missing_images" });
});
