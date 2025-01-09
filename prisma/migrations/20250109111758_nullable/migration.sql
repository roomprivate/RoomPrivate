-- AlterTable
ALTER TABLE "AccessLog" ALTER COLUMN "encryptedTimestamp" DROP NOT NULL,
ALTER COLUMN "encryptedDevice" DROP NOT NULL,
ALTER COLUMN "encryptedGeoLoc" DROP NOT NULL,
ALTER COLUMN "encryptedIp" DROP NOT NULL,
ALTER COLUMN "encryptedPlatform" DROP NOT NULL;
