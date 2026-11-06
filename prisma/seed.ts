/**
 * Dados de DESENVOLVIMENTO. Recusa rodar em produção.
 * Professor: teacher@example.test / DevTeacher#2026
 * Aluno:     código DEMO-2345 / PIN 1234
 */
import { PrismaClient } from "@prisma/client";
import { hashSecret } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed de desenvolvimento não pode rodar em produção.");
  }

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@example.test" },
    update: {},
    create: {
      role: "TEACHER",
      email: "teacher@example.test",
      displayName: "Professora Demo",
      passwordHash: await hashSecret("DevTeacher#2026"),
    },
  });

  const student = await prisma.user.upsert({
    where: { studentCode: "DEMO-2345" },
    update: {},
    create: {
      role: "STUDENT",
      displayName: "Sol",
      studentCode: "DEMO-2345",
      pinHash: await hashSecret("1234"),
      sensoryProfile: { create: {} },
    },
  });

  // Consentimento do responsável do aluno de demonstração (todo aluno real tem um registro).
  if ((await prisma.consentRecord.count({ where: { studentId: student.id } })) === 0) {
    await prisma.consentRecord.create({
      data: { studentId: student.id, grantedBy: teacher.id, termsVersion: "2026.1" },
    });
  }

  await prisma.guidance.upsert({
    where: { adultId_studentId: { adultId: teacher.id, studentId: student.id } },
    update: {},
    create: { adultId: teacher.id, studentId: student.id },
  });

  const dirs = [
    { id: "norte", label: "Norte", icon: "norte" },
    { id: "sul", label: "Sul", icon: "sul" },
    { id: "leste", label: "Leste", icon: "leste" },
    { id: "oeste", label: "Oeste", icon: "oeste" },
  ];
  const where = (position: string, piece: { label: string; icon: string }, key: string) => ({
    key,
    prompt: `Onde fica a ${piece.label.toLowerCase()}?`, // peças de exemplo são todas femininas
    hint: "Olhe o mapa. Você está no meio.",
    piece,
    position,
    options: dirs,
    correctId: position,
  });

  const letter = (key: string, display: string, others: string[]) => ({
    key,
    prompt: `Qual é a letra ${display.toLowerCase()} pequena?`,
    hint: "A letra pequena parece com a grande.",
    display,
    options: [display.toLowerCase(), ...others].map((l) => ({ id: `l-${l}`, label: l })),
    correctId: `l-${display.toLowerCase()}`,
  });

  const sum = (key: string, a: number, b: number, wrong: number[]) => ({
    key,
    prompt: b > 0 ? "Quantas maçãs no total?" : "Quantas maçãs tem?",
    hint: "Conte as maçãs uma por uma.",
    a,
    b,
    options: [a + b, ...wrong].map((n) => ({ id: `n-${n}`, label: String(n) })),
    correctId: `n-${a + b}`,
  });

  const activities = [
    {
      id: "seed-localizacao",
      module: "LOCALIZACAO" as const,
      title: "Onde fica?",
      instruction: "Toque no lado certo do mapa",
      content: {
        items: [
          where("norte", { label: "Escola", icon: "escola" }, "escola-norte"),
          where("leste", { label: "Casa", icon: "casa" }, "casa-leste"),
          where("sul", { label: "Árvore", icon: "arvore" }, "arvore-sul"),
        ],
      },
    },
    {
      id: "seed-grafia",
      module: "GRAFIA" as const,
      title: "Letras",
      instruction: "Ache a letra pequena",
      content: {
        items: [letter("letra-a", "A", ["o", "e"]), letter("letra-b", "B", ["d", "p"]), letter("letra-m", "M", ["n", "w"])],
      },
    },
    {
      id: "seed-matematica",
      module: "MATEMATICA" as const,
      title: "Contas",
      instruction: "Conte as maçãs",
      content: {
        items: [sum("conta-3", 3, 0, [2, 4]), sum("conta-2-1", 2, 1, [2, 4]), sum("conta-3-2", 3, 2, [4, 6])],
      },
    },
    {
      id: "seed-livre",
      module: "FOLHA" as const,
      title: "Bichos e sentimentos",
      instruction: "Leia e responda",
      content: {
        support: {
          text: "Na casa da Ana mora um **cachorro**. Ele late quando alguém chega e balança o rabo quando está **feliz**.",
          icon: "casa",
        },
        items: [
          {
            type: "escolha",
            key: "bicho-late",
            prompt: "Qual bicho faz au-au?",
            hint: "Ele é amigo das pessoas e balança o rabo.",
            options: [
              { id: "o-gato", label: "Gato", icon: "gato" },
              { id: "o-cachorro", label: "Cachorro", icon: "cachorro" },
              { id: "o-peixe", label: "Peixe", icon: "peixe" },
            ],
            correctId: "o-cachorro",
          },
          {
            type: "marcar",
            key: "bichos-pelo",
            prompt: "Marque os bichos que têm pelo",
            hint: "O peixe vive na água e tem escamas.",
            options: [
              { id: "o-gato", label: "Gato", icon: "gato" },
              { id: "o-peixe", label: "Peixe", icon: "peixe" },
              { id: "o-cachorro", label: "Cachorro", icon: "cachorro" },
            ],
            correctIds: ["o-gato", "o-cachorro"],
          },
          {
            type: "vf",
            key: "ana-feliz",
            prompt: "É verdadeiro ou falso?",
            hint: "Leia o texto de novo.",
            supportIcon: "feliz",
            statements: [
              { id: "s1", text: "O cachorro da Ana late quando alguém chega.", correct: true },
              { id: "s2", text: "O cachorro mora na escola.", correct: false },
            ],
          },
        ],
      },
    },
  ];


  for (const a of activities) {
    await prisma.activity.upsert({
      where: { id: a.id },
      update: { content: a.content, title: a.title, instruction: a.instruction, published: true },
      create: { ...a, published: true, authorId: teacher.id },
    });
    await prisma.assignment.upsert({
      where: { activityId_studentId: { activityId: a.id, studentId: student.id } },
      update: {},
      create: { activityId: a.id, studentId: student.id, assignedBy: teacher.id },
    });
  }

  // Folha de encaixar (sem sessões, para ficar editável): completar lacunas e ligar pares.
  const encaixar = {
    id: "seed-encaixar",
    module: "FOLHA" as const,
    title: "Formas e água",
    instruction: "Encaixe as palavras e ligue os pares",
    content: {
      support: { text: "A **água** pode ser sólida (gelo), líquida ou gasosa (vapor).", icon: "agua" },
      items: [
        {
          type: "lacunas",
          key: "item-1",
          prompt: "Complete com as palavras",
          hint: "Leia o texto de cima.",
          text: "O [gelo] é água sólida. O [vapor] é água gasosa.",
          extras: ["fogo"],
        },
        {
          type: "ligar",
          key: "item-2",
          prompt: "Ligue cada objeto à sua forma",
          hint: "A bola é redonda.",
          pairs: [
            { id: "p1", left: { label: "Bola de basquete" }, right: { label: "Círculo", icon: "circulo" } },
            { id: "p2", left: { label: "Telhado da casa" }, right: { label: "Triângulo" } },
            { id: "p3", left: { label: "Cubo mágico" }, right: { label: "Quadrado" } },
          ],
        },
      ],
    },
  };
  await prisma.activity.upsert({
    where: { id: encaixar.id },
    update: { content: encaixar.content, title: encaixar.title, instruction: encaixar.instruction, published: true },
    create: { ...encaixar, published: true, authorId: teacher.id },
  });
  await prisma.assignment.upsert({
    where: { activityId_studentId: { activityId: encaixar.id, studentId: student.id } },
    update: {},
    create: { activityId: encaixar.id, studentId: student.id, assignedBy: teacher.id },
  });

  // Folha com ordenar, nomear e separar em grupos (sem sessões, para ficar editável).
  const organizar = {
    id: "seed-organizar",
    module: "FOLHA" as const,
    title: "Organizar e separar",
    instruction: "Coloque em ordem, dê os nomes e separe",
    content: {
      items: [
        {
          type: "ordenar",
          key: "item-1",
          prompt: "Organize as letras e forme a palavra",
          hint: "É o que a gente bebe.",
          order: "letras",
          pieces: ["Á", "G", "U", "A"],
        },
        {
          type: "ordenar",
          key: "item-2",
          prompt: "Coloque a rotina na ordem",
          order: "passos",
          pieces: ["Acordar", "Tomar banho", "Comer", "Ir para a escola"],
        },
        {
          type: "nomear",
          key: "item-3",
          prompt: "Dê o nome de cada figura",
          figures: [
            { icon: "gato", answer: "Gato" },
            { icon: "sol", answer: "Sol" },
            { icon: "livro", answer: "Livro" },
          ],
          extras: ["Lua"],
        },
        {
          type: "classificar",
          key: "item-4",
          prompt: "Separe os fenômenos nas caixas",
          hint: "Se virou outra coisa, é químico.",
          groups: [
            { id: "g1", label: "Físico" },
            { id: "g2", label: "Químico" },
          ],
          cards: [
            { id: "c1", label: "Gelo derretendo", group: "g1" },
            { id: "c2", label: "Papel amassado", group: "g1" },
            { id: "c3", label: "Ferrugem", group: "g2" },
            { id: "c4", label: "Papel queimado", group: "g2" },
          ],
        },
      ],
    },
  };
  await prisma.activity.upsert({
    where: { id: organizar.id },
    update: { content: organizar.content, title: organizar.title, instruction: organizar.instruction, published: true },
    create: { ...organizar, published: true, authorId: teacher.id },
  });
  await prisma.assignment.upsert({
    where: { activityId_studentId: { activityId: organizar.id, studentId: student.id } },
    update: {},
    create: { activityId: organizar.id, studentId: student.id, assignedBy: teacher.id },
  });

  // Escrever o nome: só a configuração; as letras vêm do apelido de cada aluno ("Sol").
  const nome = {
    id: "seed-nome",
    module: "NOME" as const,
    title: "Meu nome",
    instruction: "Monte o seu nome com as letras",
    content: {
      items: [{ key: "nome", prompt: "Escreva seu nome", extraLetters: 3, letterCase: "MAIUSCULAS", showModel: true }],
    },
  };
  await prisma.activity.upsert({
    where: { id: nome.id },
    update: { content: nome.content, title: nome.title, instruction: nome.instruction, published: true },
    create: { ...nome, published: true, authorId: teacher.id },
  });
  await prisma.assignment.upsert({
    where: { activityId_studentId: { activityId: nome.id, studentId: student.id } },
    update: {},
    create: { activityId: nome.id, studentId: student.id, assignedBy: teacher.id },
  });

  // Sessões de demonstração (só dev): 8 sessões em ~2 semanas em que o aluno ganha autonomia.
  // A folha fica sem sessões, para o professor poder editá-la (sessões travam o conteúdo).
  await prisma.activitySession.deleteMany({ where: { id: { startsWith: "seed-sess-" } } });
  const DAY = 24 * 60 * 60 * 1000;
  const withSessions = activities.filter((a) => a.module !== "FOLHA");
  for (let i = 0; i < 8; i++) {
    const activity = withSessions[i % withSessions.length]!;
    const keys = (activity.content.items as { key: string }[]).map((it) => it.key);
    const independentItems = Math.min(keys.length, Math.floor(i / 2));
    const attempts: { itemKey: string; correct: boolean; helpLevel: "NONE" | "VERBAL_HINT"; elapsedMs: number; attemptNo: number }[] = [];
    keys.forEach((itemKey, j) => {
      const base = 7000 - i * 450 + j * 300;
      if (j < independentItems) {
        attempts.push({ itemKey, correct: true, helpLevel: "NONE", elapsedMs: base, attemptNo: 1 });
      } else {
        attempts.push({ itemKey, correct: false, helpLevel: "NONE", elapsedMs: base, attemptNo: 1 });
        attempts.push({ itemKey, correct: true, helpLevel: i < 4 ? "VERBAL_HINT" : "NONE", elapsedMs: base + 3500, attemptNo: 2 });
      }
    });
    const startedAt = new Date(Date.now() - (14 - i * 2) * DAY);
    await prisma.activitySession.create({
      data: {
        id: `seed-sess-${i}`,
        studentId: student.id,
        activityId: activity.id,
        status: "COMPLETED",
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 90_000),
        durationMs: 90_000 - i * 4_000,
        totalAttempts: attempts.length,
        correctCount: attempts.filter((a) => a.correct).length,
        redirects: attempts.filter((a) => !a.correct).length,
        maxHelpLevel: i < 4 ? "VERBAL_HINT" : "NONE",
        themeUsed: "CALMO",
        contentModeUsed: "TEXTUAL",
        attempts: { create: attempts },
      },
    });
  }

  console.log("Seed concluído (professor, aluno, 7 atividades e 8 sessões de demonstração).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
