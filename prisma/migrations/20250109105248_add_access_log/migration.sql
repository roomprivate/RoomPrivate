-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);
