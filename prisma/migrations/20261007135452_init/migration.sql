-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TEACHER', 'THERAPIST', 'STUDENT');

-- CreateEnum
CREATE TYPE "SensoryTheme" AS ENUM ('CALMO', 'FOCO', 'CONTRASTE');

-- CreateEnum
CREATE TYPE "ContentMode" AS ENUM ('TEXTUAL', 'PICTOGRAFICO');

-- CreateEnum
CREATE TYPE "FontFamily" AS ENUM ('SANS', 'LEITURA');

-- CreateEnum
CREATE TYPE "ActivityModule" AS ENUM ('LOCALIZACAO', 'GRAFIA', 'MATEMATICA', 'CIENCIAS');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('INICIAL', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "HelpLevel" AS ENUM ('NONE', 'VERBAL_HINT', 'VISUAL_HINT', 'FULL_MODEL');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "studentCode" TEXT,
    "pinHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guidance" (
    "id" TEXT NOT NULL,
    "adultId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guidance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensoryProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" "SensoryTheme" NOT NULL DEFAULT 'CALMO',
    "contentMode" "ContentMode" NOT NULL DEFAULT 'TEXTUAL',
    "fontFamily" "FontFamily" NOT NULL DEFAULT 'SANS',
    "reducedMotion" BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT false,
    "audioPrompts" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensoryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "module" "ActivityModule" NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INICIAL',
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "pictograms" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "redirects" INTEGER NOT NULL DEFAULT 0,
    "maxHelpLevel" "HelpLevel" NOT NULL DEFAULT 'NONE',
    "themeUsed" "SensoryTheme",
    "contentModeUsed" "ContentMode",

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "helpLevel" "HelpLevel" NOT NULL DEFAULT 'NONE',
    "elapsedMs" INTEGER NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "termsVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentCode_key" ON "User"("studentCode");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Guidance_studentId_idx" ON "Guidance"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Guidance_adultId_studentId_key" ON "Guidance"("adultId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SensoryProfile_userId_key" ON "SensoryProfile"("userId");

-- CreateIndex
CREATE INDEX "Activity_module_difficulty_idx" ON "Activity"("module", "difficulty");

-- CreateIndex
CREATE INDEX "Activity_authorId_idx" ON "Activity"("authorId");

-- CreateIndex
CREATE INDEX "Assignment_studentId_idx" ON "Assignment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_activityId_studentId_key" ON "Assignment"("activityId", "studentId");

-- CreateIndex
CREATE INDEX "ActivitySession_studentId_startedAt_idx" ON "ActivitySession"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "ActivitySession_activityId_idx" ON "ActivitySession"("activityId");

-- CreateIndex
CREATE INDEX "ActivitySession_status_idx" ON "ActivitySession"("status");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_itemKey_idx" ON "Attempt"("sessionId", "itemKey");

-- CreateIndex
CREATE INDEX "ConsentRecord_studentId_idx" ON "ConsentRecord"("studentId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Guidance" ADD CONSTRAINT "Guidance_adultId_fkey" FOREIGN KEY ("adultId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guidance" ADD CONSTRAINT "Guidance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SensoryProfile" ADD CONSTRAINT "SensoryProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ActivitySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
