-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "ContentNiche" AS ENUM ('GAMING', 'TECH_EDUCATION', 'VLOG_LIFESTYLE', 'BUSINESS_FINANCE', 'ENTERTAINMENT_COMEDY', 'OTHER');

-- CreateEnum
CREATE TYPE "UploadFrequency" AS ENUM ('ONE_TO_FOUR', 'FIVE_TO_TEN', 'ELEVEN_TO_TWENTY', 'TWENTY_PLUS');

-- CreateEnum
CREATE TYPE "PrimaryGoal" AS ENUM ('SAVE_TIME_EDITING', 'BETTER_THUMBNAILS_CTR', 'CONSISTENT_SCHEDULE', 'GROW_VIEWS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "googleId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "niche" "ContentNiche",
    "uploadFrequency" "UploadFrequency",
    "primaryGoal" "PrimaryGoal",
    "recommendedPlanId" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
