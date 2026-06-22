-- AlterTable: renomeia colunas mp* para nomes agnósticos ao provedor de pagamento
ALTER TABLE "User" RENAME COLUMN "mpSubscriptionId"     TO "subscriptionId";
ALTER TABLE "User" RENAME COLUMN "mpSubscriptionStatus" TO "subscriptionStatus";
ALTER TABLE "User" RENAME COLUMN "mpNextBillingDate"    TO "nextBillingDate";
