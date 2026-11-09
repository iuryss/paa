-- Dificuldade usada em cada sessão (snapshot), para o relatório não mudar quando a atividade é editada.
ALTER TABLE "ActivitySession" ADD COLUMN "difficultyUsed" "Difficulty";

-- Sessões antigas: melhor estimativa disponível é a dificuldade atual da atividade.
UPDATE "ActivitySession" AS s
SET "difficultyUsed" = a."difficulty"
FROM "Activity" AS a
WHERE a."id" = s."activityId";
