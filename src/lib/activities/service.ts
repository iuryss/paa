import type { ActivityModule, Difficulty, Prisma } from "@prisma/client";
import { fromContent, type EditorItem } from "@/lib/activities/editor-model";
import { prisma } from "@/lib/db";
import {
  contentSchemas,
  isSupportedModule,
  parseActivityContent,
  type AssignActivityInput,
  type CreateActivityInput,
  type SupportedModule,
  type UpdateActivityInput,
} from "@/lib/validation/activities";

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; code: "not_found" | "forbidden" };

/** Cria a atividade guardando o conteúdo JÁ sanitizado (não o JSON cru da requisição). */
export async function createActivity(
  authorId: string,
  input: CreateActivityInput,
): Promise<{ id: string }> {
  const content = contentSchemas[input.module].parse(input.content);
  const activity = await prisma.activity.create({
    data: {
      module: input.module,
      difficulty: input.difficulty,
      title: input.title,
      instruction: input.instruction,
      content,
      published: input.published,
      authorId,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { actorId: authorId, action: "activity.create", targetId: activity.id },
  });
  return activity;
}

/** Atribui uma atividade publicada a um aluno que o adulto acompanha (vínculo Guidance). */
export async function assignActivity(
  adultId: string,
  input: AssignActivityInput,
): Promise<ServiceResult<{ id: string }>> {
  const guidance = await prisma.guidance.findUnique({
    where: { adultId_studentId: { adultId, studentId: input.studentId } },
    select: { id: true },
  });
  if (!guidance) return { ok: false, code: "forbidden" };

  const activity = await prisma.activity.findFirst({
    where: { id: input.activityId, published: true },
    select: { id: true },
  });
  if (!activity) return { ok: false, code: "not_found" };

  const assignment = await prisma.assignment.upsert({
    where: {
      activityId_studentId: { activityId: input.activityId, studentId: input.studentId },
    },
    update: {},
    create: { activityId: input.activityId, studentId: input.studentId, assignedBy: adultId },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "activity.assign", targetId: input.studentId },
  });
  return { ok: true, id: assignment.id };
}

// ───────────────────────── Biblioteca do professor ─────────────────────────

export interface ActivityRow {
  id: string;
  title: string;
  module: ActivityModule;
  difficulty: Difficulty;
  published: boolean;
  updatedAt: Date;
  authorName: string;
  sessions: number;
  assignments: number;
}

const rowSelect = {
  id: true,
  title: true,
  module: true,
  difficulty: true,
  published: true,
  updatedAt: true,
  author: { select: { displayName: true } },
  _count: { select: { sessions: true, assignments: true } },
} as const;

type RowRecord = Prisma.ActivityGetPayload<{ select: typeof rowSelect }>;

const toRow = (r: RowRecord): ActivityRow => ({
  id: r.id,
  title: r.title,
  module: r.module,
  difficulty: r.difficulty,
  published: r.published,
  updatedAt: r.updatedAt,
  authorName: r.author.displayName,
  sessions: r._count.sessions,
  assignments: r._count.assignments,
});

/** "Minhas" (rascunhos e publicadas) e "biblioteca" (publicadas por colegas, só para duplicar). */
export async function listActivitiesForAdult(
  adultId: string,
): Promise<{ mine: ActivityRow[]; library: ActivityRow[] }> {
  const [mine, library] = await Promise.all([
    prisma.activity.findMany({
      where: { authorId: adultId },
      orderBy: { updatedAt: "desc" },
      select: rowSelect,
    }),
    prisma.activity.findMany({
      where: { published: true, authorId: { not: adultId } },
      orderBy: { updatedAt: "desc" },
      select: rowSelect,
    }),
  ]);
  return { mine: mine.map(toRow), library: library.map(toRow) };
}

export interface EditableActivity {
  id: string;
  module: SupportedModule;
  difficulty: Difficulty;
  title: string;
  instruction: string;
  published: boolean;
  items: EditorItem[];
  /** Com sessões gravadas, o conteúdo fica travado para não distorcer os gráficos. */
  sessionCount: number;
}

/** Só o autor edita. Para qualquer outra pessoa a atividade "não existe". */
export async function getActivityForEdit(
  adultId: string,
  activityId: string,
): Promise<EditableActivity | null> {
  const row = await prisma.activity.findFirst({
    where: { id: activityId, authorId: adultId },
    select: {
      id: true,
      module: true,
      difficulty: true,
      title: true,
      instruction: true,
      published: true,
      content: true,
      _count: { select: { sessions: true } },
    },
  });
  if (!row || !isSupportedModule(row.module)) return null;

  const parsed = parseActivityContent(row.module, row.content);
  if (!parsed.success) return null;

  return {
    id: row.id,
    module: row.module,
    difficulty: row.difficulty,
    title: row.title,
    instruction: row.instruction,
    published: row.published,
    items: fromContent(row.module, parsed.content),
    sessionCount: row._count.sessions,
  };
}

export type UpdateResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "locked" | "invalid_content" };

export async function updateActivity(
  adultId: string,
  activityId: string,
  input: UpdateActivityInput,
): Promise<UpdateResult> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, authorId: adultId },
    select: { module: true, _count: { select: { sessions: true } } },
  });
  if (!activity) return { ok: false, code: "not_found" };

  const data: Prisma.ActivityUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.instruction !== undefined) data.instruction = input.instruction;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty;
  if (input.published !== undefined) data.published = input.published;

  if ("content" in input) {
    if (activity._count.sessions > 0) return { ok: false, code: "locked" };
    if (!isSupportedModule(activity.module)) return { ok: false, code: "invalid_content" };
    const parsed = contentSchemas[activity.module].safeParse(input.content);
    if (!parsed.success) return { ok: false, code: "invalid_content" };
    data.content = parsed.data as Prisma.InputJsonValue;
  }

  await prisma.activity.update({ where: { id: activityId }, data });
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "activity.update", targetId: activityId },
  });
  return { ok: true };
}

/** Copia uma atividade própria ou publicada por um colega. A cópia nasce como rascunho do adulto. */
export async function duplicateActivity(
  adultId: string,
  activityId: string,
): Promise<ServiceResult<{ id: string }>> {
  const source = await prisma.activity.findFirst({
    where: { id: activityId, OR: [{ authorId: adultId }, { published: true }] },
    select: { module: true, difficulty: true, title: true, instruction: true, content: true },
  });
  if (!source) return { ok: false, code: "not_found" };

  const copy = await prisma.activity.create({
    data: {
      module: source.module,
      difficulty: source.difficulty,
      title: `Cópia de ${source.title}`.slice(0, 80),
      instruction: source.instruction,
      content: source.content as Prisma.InputJsonValue,
      published: false,
      authorId: adultId,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "activity.duplicate", targetId: copy.id },
  });
  return { ok: true, id: copy.id };
}

export type DeleteResult = { ok: true } | { ok: false; code: "not_found" | "has_sessions" };

/** Exclui só atividade própria e sem sessões (com sessões, os gráficos dos alunos dependem dela). */
export async function deleteActivity(adultId: string, activityId: string): Promise<DeleteResult> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, authorId: adultId },
    select: { _count: { select: { sessions: true } } },
  });
  if (!activity) return { ok: false, code: "not_found" };
  if (activity._count.sessions > 0) return { ok: false, code: "has_sessions" };

  await prisma.activity.delete({ where: { id: activityId } });
  await prisma.auditLog.create({
    data: { actorId: adultId, action: "activity.delete", targetId: activityId },
  });
  return { ok: true };
}
