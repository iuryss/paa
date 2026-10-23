-- CreateEnum
CREATE TYPE "MarkerStyle" AS ENUM ('CORES_E_FORMAS', 'FORMAS', 'CORES');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "markerStyle" "MarkerStyle" NOT NULL DEFAULT 'CORES_E_FORMAS';
