/*
  Warnings:

  - Added the required column `entropyMark` to the `AccessLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AccessLog" ADD COLUMN     "entropyMark" TEXT NOT NULL;
