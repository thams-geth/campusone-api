-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('TEACHING', 'BREAK', 'LUNCH');

-- CreateTable
CREATE TABLE "PeriodSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PeriodType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodSlot_tenantId_idx" ON "PeriodSlot"("tenantId");

-- AddForeignKey
ALTER TABLE "PeriodSlot" ADD CONSTRAINT "PeriodSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security, same standard (non-bootstrap) pattern as every other
-- post-auth tenant-scoped table (see TimetableEntry's own migration).
ALTER TABLE "PeriodSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PeriodSlot" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PeriodSlot"
  USING ("tenantId" = current_setting('app.current_tenant', true));
