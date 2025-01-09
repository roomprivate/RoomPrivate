/*
  Warnings:

  - Added the required column `encryptedTimestamp` to the `AccessLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AccessLog" ADD COLUMN     "encryptedTimestamp" TEXT NOT NULL;
