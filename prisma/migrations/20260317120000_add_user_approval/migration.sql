-- Add manual approval gate for all users
ALTER TABLE "User"
ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false;

-- Keep existing users working after rollout
UPDATE "User"
SET "isApproved" = true;
