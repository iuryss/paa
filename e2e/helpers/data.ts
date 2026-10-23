import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_DATABASE_URL } from "../../playwright.config";

export const TEACHER = { email: "prof@e2e.test", password: "Professora#E2E2026", name: "Professora E2E" };
export const OTHER_TEACHER = { email: "outro@e2e.test", password: "OutroProf#E2E2026", name: "Outro Prof" };
export const STUDENT = { code: "E2EA-0001", pin: "1234", name: "Sol" };
/** Aluno separado para os testes de bloqueio (o limitador de tentativas guarda estado no servidor). */
export const LOCK_STUDENT = { code: "E2EB-0002", pin: "4321", name: "Lua" };
export const CRON_SECRET = "e2e-cron-secret-0123456789";

export const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const hash = (secret: string) => bcrypt.hash(secret, 4); // custo baixo: só para os testes ficarem rápidos

const grafia = {
  items: [
    {
      key: "item-1",
      prompt: "Qual é a letra a pequena?",
      hint: "A letra pequena parece com a grande.",
      display: "A",
      options: [
        { id: "l-a", label: "a" },
        { id: "l-o", label: "o" },
        { id: "l-e", label: "e" },
      ],
      correctId: "l-a",
    },
    {
      key: "item-2",
      prompt: "Qual é a letra b pequena?",
      display: "B",
      options: [
        { id: "l-b", label: "b" },
        { id: "l-d", label: "d" },
      ],
      correctId: "l-b",
    },
  ],
};

const localizacao = {
  items: [
    {
      key: "escola-norte",
      prompt: "Onde fica a escola?",
      piece: { label: "Escola", icon: "escola" },
      position: "norte",
      options: ["norte", "sul", "leste", "oeste"].map((d) => ({ id: d, label: d[0]!.toUpperCase() + d.slice(1), icon: d })),
      correctId: "norte",
    },
  ],
};

const matematica = {
  items: [
    {
      key: "conta-2-1",
      prompt: "Quantas maçãs no total?",
      a: 2,
      b: 1,
      options: [
        { id: "n-3", label: "3" },
        { id: "n-4", label: "4" },
      ],
      correctId: "n-3",
    },
  ],
};

const livre = {
  items: [
    {
      key: "bicho-late",
      prompt: "Qual bicho faz au-au?",
      hint: "Ele balança o rabo.",
      support: "Na casa da Ana mora um bicho. Ele late quando alguém chega.",
      supportIcon: "casa",
      options: [
        { id: "o-gato", label: "Gato", icon: "gato" },
        { id: "o-cachorro", label: "Cachorro", icon: "cachorro" },
        { id: "o-peixe", label: "Peixe", icon: "peixe" },
      ],
      correctId: "o-cachorro",
    },
  ],
};

export interface Seeded {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  lockStudentId: string;
  activities: { grafia: string; localizacao: string; matematica: string; livre: string };
}

/** Apaga TUDO do banco de testes e recria o mínimo conhecido. Cada arquivo de teste começa limpo. */
export async function resetAndSeed(): Promise<Seeded> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Activity", "AuditLog" CASCADE');

  const teacher = await prisma.user.create({
    data: { role: "TEACHER", email: TEACHER.email, displayName: TEACHER.name, passwordHash: await hash(TEACHER.password) },
  });
  const other = await prisma.user.create({
    data: { role: "TEACHER", email: OTHER_TEACHER.email, displayName: OTHER_TEACHER.name, passwordHash: await hash(OTHER_TEACHER.password) },
  });

  const student = async (s: typeof STUDENT) =>
    prisma.user.create({
      data: {
        role: "STUDENT",
        displayName: s.name,
        studentCode: s.code,
        pinHash: await hash(s.pin),
        sensoryProfile: { create: {} },
        guidances: { create: { adultId: teacher.id } },
        consents: { create: { grantedBy: teacher.id, termsVersion: "2026.1" } },
      },
    });
  const sol = await student(STUDENT);
  const lua = await student(LOCK_STUDENT);

  const activity = (id: string, module: "GRAFIA" | "LOCALIZACAO" | "MATEMATICA" | "LIVRE", title: string, instruction: string, content: object) =>
    prisma.activity.create({
      data: { id, module, title, instruction, content: content as Prisma.InputJsonValue, published: true, authorId: teacher.id },
    });
  const g = await activity("e2e-grafia", "GRAFIA", "Letras", "Ache a letra pequena", grafia);
  const l = await activity("e2e-localizacao", "LOCALIZACAO", "Onde fica?", "Toque no lado certo do mapa", localizacao);
  const m = await activity("e2e-matematica", "MATEMATICA", "Contas", "Conte as maçãs", matematica);
  const f = await activity("e2e-livre", "LIVRE", "Bichos", "Leia e escolha a resposta", livre);

  for (const s of [sol, lua]) {
    for (const a of [g, l, m, f]) {
      await prisma.assignment.create({ data: { activityId: a.id, studentId: s.id, assignedBy: teacher.id } });
    }
  }

  return {
    teacherId: teacher.id,
    otherTeacherId: other.id,
    studentId: sol.id,
    lockStudentId: lua.id,
    activities: { grafia: g.id, localizacao: l.id, matematica: m.id, livre: f.id },
  };
}

/** Cria sessões concluídas com resultados conhecidos (para os gráficos do professor). */
export async function seedCompletedSessions(studentId: string, activityId: string, count = 3) {
  const day = 24 * 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    const startedAt = new Date(Date.now() - (count - i) * day);
    await prisma.activitySession.create({
      data: {
        studentId,
        activityId,
        status: "COMPLETED",
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 60_000),
        durationMs: 60_000,
        totalAttempts: 2,
        correctCount: 2,
        redirects: 0,
        attempts: {
          create: [
            { itemKey: "item-1", correct: true, helpLevel: "NONE", elapsedMs: 3000 + i * 500, attemptNo: 1 },
            { itemKey: "item-2", correct: true, helpLevel: "NONE", elapsedMs: 2500, attemptNo: 1 },
          ],
        },
      },
    });
  }
}

export async function setTheme(userId: string, theme: "CALMO" | "FOCO" | "CONTRASTE") {
  await prisma.sensoryProfile.upsert({
    where: { userId },
    update: { theme },
    create: { userId, theme },
  });
}

/** Aluno extra, vinculado à professora, com consentimento (para testes que apagam/alteram). */
export async function addStudent(teacherId: string, name: string, code: string, pin = "1234") {
  return prisma.user.create({
    data: {
      role: "STUDENT",
      displayName: name,
      studentCode: code,
      pinHash: await hash(pin),
      sensoryProfile: { create: {} },
      guidances: { create: { adultId: teacherId } },
      consents: { create: { grantedBy: teacherId, termsVersion: "2026.1" } },
    },
  });
}
