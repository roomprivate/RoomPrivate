-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "encryptedPassword" TEXT,
    "ownerId" TEXT NOT NULL,
    "members" TEXT NOT NULL DEFAULT '{}',
    "roles" TEXT NOT NULL DEFAULT '[]',
    "encryptedRoomKey" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);
