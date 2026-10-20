-- AlterTable
ALTER TABLE "agent_conversations" ADD COLUMN     "history" JSONB NOT NULL DEFAULT '[]';
