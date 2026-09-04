-- AlterTable
ALTER TABLE "User" ADD COLUMN     "previousRefreshTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "previousRefreshTokenHash" TEXT;
