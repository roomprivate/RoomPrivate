/*
  Warnings:

  - The primary key for the `AccessLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `createdAt` on the `AccessLog` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedData` on the `AccessLog` table. All the data in the column will be lost.
  - The `id` column on the `AccessLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `encryptedDevice` to the `AccessLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedGeoLoc` to the `AccessLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedIp` to the `AccessLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encryptedPlatform` to the `AccessLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AccessLog" DROP CONSTRAINT "AccessLog_pkey",
DROP COLUMN "createdAt",
DROP COLUMN "encryptedData",
ADD COLUMN     "encryptedDevice" TEXT NOT NULL,
ADD COLUMN     "encryptedGeoLoc" TEXT NOT NULL,
ADD COLUMN     "encryptedIp" TEXT NOT NULL,
ADD COLUMN     "encryptedPlatform" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id");
