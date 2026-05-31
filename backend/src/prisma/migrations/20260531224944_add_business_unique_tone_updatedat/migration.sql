/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Business` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Business` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: adiciona updatedAt com DEFAULT temporário para linhas existentes, depois remove o default
ALTER TABLE "Business" ADD COLUMN "tone" TEXT NOT NULL DEFAULT 'NEUTRO',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Business" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");
