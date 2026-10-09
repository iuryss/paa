import type { ActivityModule, Difficulty } from "@prisma/client";
import { prisma } from "@/lib/db";
import { shuffleItemOptions } from "@/lib/activities/shuffle";
import { parseActivityContent, type PlayItem } from "@/lib/validation/activities";

export interface ActivitySummary {
  id: string;
  title: string;
  module: ActivityModule;
  difficulty: Difficulty;
}

export interface PlayableActivity extends ActivitySummary {
  instruction: string;
  items: PlayItem[];
}

export async function listAssignedActivities(studentId: string): Promise<ActivitySummary[]> {
  const rows = await prisma.assignment.findMany({
    where: { studentId, activity: { published: true } },
    orderBy: { createdAt: "asc" },
    select: { activity: { select: { id: true, title: true, module: true, difficulty: true } } },
  });
  return rows.map((r) => r.activity);
}

/** Atividade pronta para jogar, só se estiver atribuída ao aluno, publicada e com conteúdo válido. */
export async function getPlayableActivity(
  studentId: string,
  activityId: string,
  random: () => number = Math.random,
): Promise<PlayableActivity | null> {
  const row = await prisma.assignment.findFirst({
    where: { studentId, activityId, activity: { published: true } },
    select: {
      activity: {
        select: {
          id: true,
          title: true,
          module: true,
          difficulty: true,
          instruction: true,
          content: true,
        },
      },
    },
  });
  if (!row) return null;

  const { content, ...activity } = row.activity;
  const parsed = parseActivityContent(activity.module, content);
  if (!parsed.success) return null;
  return { ...activity, items: shuffleItemOptions(parsed.items, random) };
}
