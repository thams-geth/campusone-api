-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('APPLIED', 'DOCUMENT_VERIFICATION', 'SHORTLISTED', 'APPROVED', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'HOSTEL', 'TRANSPORT', 'EXAM', 'LIBRARY', 'LAB', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeInvoiceStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');

-- CreateEnum
CREATE TYPE "FeeAdjustmentType" AS ENUM ('DISCOUNT', 'SCHOLARSHIP', 'FINE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'UPI', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('STUDENT', 'FACULTY');

-- CreateEnum
CREATE TYPE "CertificateRequestStatus" AS ENUM ('REQUESTED', 'ISSUED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ACHIEVEMENT', 'EVENT', 'CLUB', 'SPORTS', 'COMPETITION', 'INTERNSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "PlacementApplicationStatus" AS ENUM ('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "DocumentOwnerType" ADD VALUE 'APPLICANT';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "admissionApplicationId" TEXT;

-- CreateTable
CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "programId" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'APPLIED',
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "category" "FeeCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "FeeInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "FeeAdjustmentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "originalPaymentId" TEXT,
    "transactionRef" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hostel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hostel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hostelRoomId" TEXT NOT NULL,
    "bedNumber" INTEGER NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostelAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTransport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentTransport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "category" TEXT,
    "isbn" TEXT,
    "totalCopies" INTEGER NOT NULL,
    "availableCopies" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookIssue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "ownerType" "PersonType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "fineAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "certificateTypeId" TEXT NOT NULL,
    "status" "CertificateRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "issuedByUserId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "verificationCode" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "minCgpa" DOUBLE PRECISION,
    "ctcOffered" INTEGER,
    "applicationDeadline" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "status" "PlacementApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "offeredCtc" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacementApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmissionApplication_tenantId_idx" ON "AdmissionApplication"("tenantId");

-- CreateIndex
CREATE INDEX "AdmissionApplication_programId_idx" ON "AdmissionApplication"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplication_tenantId_email_programId_key" ON "AdmissionApplication"("tenantId", "email", "programId");

-- CreateIndex
CREATE INDEX "FeeStructure_tenantId_idx" ON "FeeStructure"("tenantId");

-- CreateIndex
CREATE INDEX "FeeStructure_programId_idx" ON "FeeStructure"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_tenantId_programId_academicYearId_category_key" ON "FeeStructure"("tenantId", "programId", "academicYearId", "category");

-- CreateIndex
CREATE INDEX "FeeInvoice_tenantId_idx" ON "FeeInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "FeeInvoice_studentId_idx" ON "FeeInvoice"("studentId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_tenantId_idx" ON "FeeAdjustment"("tenantId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_invoiceId_idx" ON "FeeAdjustment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Hostel_tenantId_idx" ON "Hostel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Hostel_tenantId_name_key" ON "Hostel"("tenantId", "name");

-- CreateIndex
CREATE INDEX "HostelRoom_tenantId_idx" ON "HostelRoom"("tenantId");

-- CreateIndex
CREATE INDEX "HostelRoom_hostelId_idx" ON "HostelRoom"("hostelId");

-- CreateIndex
CREATE UNIQUE INDEX "HostelRoom_tenantId_hostelId_roomNumber_key" ON "HostelRoom"("tenantId", "hostelId", "roomNumber");

-- CreateIndex
CREATE INDEX "HostelAllocation_tenantId_idx" ON "HostelAllocation"("tenantId");

-- CreateIndex
CREATE INDEX "HostelAllocation_studentId_idx" ON "HostelAllocation"("studentId");

-- CreateIndex
CREATE INDEX "HostelAllocation_hostelRoomId_idx" ON "HostelAllocation"("hostelRoomId");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_idx" ON "Vehicle"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_registrationNumber_key" ON "Vehicle"("tenantId", "registrationNumber");

-- CreateIndex
CREATE INDEX "Route_tenantId_idx" ON "Route"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_tenantId_name_key" ON "Route"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Stop_tenantId_idx" ON "Stop"("tenantId");

-- CreateIndex
CREATE INDEX "Stop_routeId_idx" ON "Stop"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_tenantId_routeId_sequence_key" ON "Stop"("tenantId", "routeId", "sequence");

-- CreateIndex
CREATE INDEX "StudentTransport_tenantId_idx" ON "StudentTransport"("tenantId");

-- CreateIndex
CREATE INDEX "StudentTransport_studentId_idx" ON "StudentTransport"("studentId");

-- CreateIndex
CREATE INDEX "Book_tenantId_idx" ON "Book"("tenantId");

-- CreateIndex
CREATE INDEX "BookIssue_tenantId_idx" ON "BookIssue"("tenantId");

-- CreateIndex
CREATE INDEX "BookIssue_bookId_idx" ON "BookIssue"("bookId");

-- CreateIndex
CREATE INDEX "BookIssue_ownerType_ownerId_idx" ON "BookIssue"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "CertificateType_tenantId_idx" ON "CertificateType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateType_tenantId_name_key" ON "CertificateType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRequest_verificationCode_key" ON "CertificateRequest"("verificationCode");

-- CreateIndex
CREATE INDEX "CertificateRequest_tenantId_idx" ON "CertificateRequest"("tenantId");

-- CreateIndex
CREATE INDEX "CertificateRequest_studentId_idx" ON "CertificateRequest"("studentId");

-- CreateIndex
CREATE INDEX "StudentActivity_tenantId_idx" ON "StudentActivity"("tenantId");

-- CreateIndex
CREATE INDEX "StudentActivity_studentId_idx" ON "StudentActivity"("studentId");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_name_key" ON "Company"("tenantId", "name");

-- CreateIndex
CREATE INDEX "JobOpening_tenantId_idx" ON "JobOpening"("tenantId");

-- CreateIndex
CREATE INDEX "JobOpening_companyId_idx" ON "JobOpening"("companyId");

-- CreateIndex
CREATE INDEX "PlacementApplication_tenantId_idx" ON "PlacementApplication"("tenantId");

-- CreateIndex
CREATE INDEX "PlacementApplication_jobOpeningId_idx" ON "PlacementApplication"("jobOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementApplication_studentId_jobOpeningId_key" ON "PlacementApplication"("studentId", "jobOpeningId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_admissionApplicationId_key" ON "Student"("admissionApplicationId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_admissionApplicationId_fkey" FOREIGN KEY ("admissionApplicationId") REFERENCES "AdmissionApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeInvoice" ADD CONSTRAINT "FeeInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeInvoice" ADD CONSTRAINT "FeeInvoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeInvoice" ADD CONSTRAINT "FeeInvoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "FeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_originalPaymentId_fkey" FOREIGN KEY ("originalPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hostel" ADD CONSTRAINT "Hostel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRoom" ADD CONSTRAINT "HostelRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRoom" ADD CONSTRAINT "HostelRoom_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelAllocation" ADD CONSTRAINT "HostelAllocation_hostelRoomId_fkey" FOREIGN KEY ("hostelRoomId") REFERENCES "HostelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransport" ADD CONSTRAINT "StudentTransport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransport" ADD CONSTRAINT "StudentTransport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransport" ADD CONSTRAINT "StudentTransport_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransport" ADD CONSTRAINT "StudentTransport_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookIssue" ADD CONSTRAINT "BookIssue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookIssue" ADD CONSTRAINT "BookIssue_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateType" ADD CONSTRAINT "CertificateType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_certificateTypeId_fkey" FOREIGN KEY ("certificateTypeId") REFERENCES "CertificateType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRequest" ADD CONSTRAINT "CertificateRequest_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementApplication" ADD CONSTRAINT "PlacementApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementApplication" ADD CONSTRAINT "PlacementApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementApplication" ADD CONSTRAINT "PlacementApplication_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-Level Security for every new tenant-scoped table, matching the
-- pattern established in every prior migration (see the init
-- migration's comment block for the full rationale).

ALTER TABLE "AdmissionApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdmissionApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdmissionApplication"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "FeeStructure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeStructure" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeStructure"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "FeeInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeInvoice"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "FeeAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeeAdjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeAdjustment"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Hostel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hostel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Hostel"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "HostelRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HostelRoom" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HostelRoom"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "HostelAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HostelAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "HostelAllocation"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Vehicle"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Route" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Route"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Stop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stop" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Stop"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "StudentTransport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentTransport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentTransport"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Book" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Book"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "BookIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookIssue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookIssue"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "CertificateType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificateType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CertificateType"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "CertificateRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificateRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CertificateRequest"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "StudentActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentActivity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentActivity"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Company"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "JobOpening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobOpening" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "JobOpening"
  USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "PlacementApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlacementApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlacementApplication"
  USING ("tenantId" = current_setting('app.current_tenant', true));
