import type { FeeInvoiceStatus } from '@prisma/client'
import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import type {
  FeeAdjustmentInput,
  FeeInvoiceInput,
  FeeStructureInput,
  ListFeeInvoicesQuery,
  ListFeeStructuresQuery,
  PaymentInput,
  RefundInput,
} from './fee.schema'

// ---- Fee structures ----

export async function listFeeStructures(params: ListFeeStructuresQuery) {
  const { page, pageSize, programId, academicYearId } = params
  const where = { ...(programId ? { programId } : {}), ...(academicYearId ? { academicYearId } : {}) }

  const [data, total] = await Promise.all([
    prisma.feeStructure.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.feeStructure.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function createFeeStructure(tenantId: string, input: FeeStructureInput) {
  const [program, academicYear] = await Promise.all([
    prisma.program.findUnique({ where: { id: input.programId } }),
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
  ])
  if (!program) throw ApiError.badRequest('Program not found.', { programId: ['Invalid program'] })
  if (!academicYear) throw ApiError.badRequest('Academic year not found.', { academicYearId: ['Invalid academic year'] })

  const existing = await prisma.feeStructure.findFirst({
    where: { programId: input.programId, academicYearId: input.academicYearId, category: input.category },
  })
  if (existing) throw ApiError.conflict('A fee structure already exists for this program/year/category.', 'DUPLICATE_STRUCTURE')

  const structure = await prisma.feeStructure.create({ data: { tenantId, ...input } })
  await logActivity('created a fee structure', { entity: 'FeeStructure', entityId: structure.id, action: 'CREATE' })
  return structure
}

export async function deleteFeeStructure(id: string) {
  const existing = await prisma.feeStructure.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Fee structure not found')

  const invoiceCount = await prisma.feeInvoice.count({ where: { feeStructureId: id } })
  if (invoiceCount > 0) throw ApiError.conflict('Cannot delete a fee structure that has invoices against it.', 'STRUCTURE_IN_USE')

  await prisma.feeStructure.delete({ where: { id } })
  await logActivity('removed a fee structure', { entity: 'FeeStructure', entityId: id, action: 'DELETE' })
}

// ---- Invoices ----

const invoiceWithLedger = { adjustments: true, payments: true } as const

export async function listInvoices(params: ListFeeInvoicesQuery) {
  const { page, pageSize, studentId, status, category } = params
  const where = { ...(studentId ? { studentId } : {}), ...(status ? { status } : {}), ...(category ? { category } : {}) }

  const [data, total] = await Promise.all([
    prisma.feeInvoice.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { dueDate: 'asc' } }),
    prisma.feeInvoice.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyInvoices(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.feeInvoice.findMany({ where: { studentId }, orderBy: { dueDate: 'asc' } })
}

export async function getInvoice(id: string) {
  const invoice = await prisma.feeInvoice.findUnique({ where: { id }, include: invoiceWithLedger })
  if (!invoice) throw ApiError.notFound('Invoice not found')
  return invoice
}

export async function createInvoice(tenantId: string, input: FeeInvoiceInput) {
  const student = await prisma.student.findUnique({ where: { id: input.studentId } })
  if (!student) throw ApiError.badRequest('Student not found.', { studentId: ['Invalid student'] })
  if (input.feeStructureId) {
    const structure = await prisma.feeStructure.findUnique({ where: { id: input.feeStructureId } })
    if (!structure) throw ApiError.badRequest('Fee structure not found.', { feeStructureId: ['Invalid fee structure'] })
  }

  const invoice = await prisma.feeInvoice.create({ data: { tenantId, ...input } })
  await logActivity(`created a ${invoice.category.toLowerCase()} invoice`, { entity: 'FeeInvoice', entityId: invoice.id, action: 'CREATE' })
  return invoice
}

/** Recomputes status from the ledger rather than trusting a stored value — same reasoning as Examinations' SGPA. WAIVED is a manual override, left alone once set. */
async function recomputeInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceWithLedger })
  if (invoice.status === 'WAIVED') return invoice

  const adjustmentDelta = invoice.adjustments.reduce((sum, a) => (a.type === 'FINE' ? sum + a.amount : sum - a.amount), 0)
  const payable = Math.max(0, invoice.amount + adjustmentDelta)
  const netPaid = invoice.payments.reduce((sum, p) => sum + (p.isRefund ? -p.amount : p.amount), 0)

  let status: FeeInvoiceStatus
  if (payable === 0 || netPaid >= payable) status = 'PAID'
  else if (netPaid > 0) status = 'PARTIAL'
  else status = invoice.dueDate < new Date() ? 'OVERDUE' : 'PENDING'

  return prisma.feeInvoice.update({ where: { id: invoiceId }, data: { status }, include: invoiceWithLedger })
}

export async function addAdjustment(invoiceId: string, createdByUserId: string, input: FeeAdjustmentInput) {
  const invoice = await prisma.feeInvoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw ApiError.notFound('Invoice not found')

  await prisma.feeAdjustment.create({ data: { tenantId: invoice.tenantId, invoiceId, createdByUserId, ...input } })
  const updated = await recomputeInvoiceStatus(invoiceId)
  await logActivity(`added a ${input.type.toLowerCase()} adjustment to an invoice`, {
    entity: 'FeeInvoice',
    entityId: invoiceId,
    action: 'ADJUSTMENT',
  })
  return updated
}

export async function waiveInvoice(invoiceId: string) {
  const invoice = await prisma.feeInvoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw ApiError.notFound('Invoice not found')

  const updated = await prisma.feeInvoice.update({ where: { id: invoiceId }, data: { status: 'WAIVED' }, include: invoiceWithLedger })
  await logActivity('waived an invoice', { entity: 'FeeInvoice', entityId: invoiceId, action: 'WAIVE' })
  return updated
}

export async function recordPayment(invoiceId: string, recordedByUserId: string, input: PaymentInput) {
  const invoice = await prisma.feeInvoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw ApiError.notFound('Invoice not found')
  if (invoice.status === 'PAID' || invoice.status === 'WAIVED') {
    throw ApiError.conflict(`This invoice is already ${invoice.status.toLowerCase()}.`, 'INVOICE_SETTLED')
  }

  const payment = await prisma.payment.create({
    data: { tenantId: invoice.tenantId, invoiceId, recordedByUserId, ...input },
  })
  await recomputeInvoiceStatus(invoiceId)
  await logActivity(`recorded a payment of ${input.amount}`, { entity: 'Payment', entityId: payment.id, action: 'CREATE' })
  return payment
}

export async function refundPayment(paymentId: string, refundedByUserId: string, input: RefundInput) {
  const original = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!original) throw ApiError.notFound('Payment not found')
  if (original.isRefund) throw ApiError.conflict('Cannot refund a refund.', 'CANNOT_REFUND_A_REFUND')
  if (input.amount > original.amount) {
    throw ApiError.badRequest('Refund amount cannot exceed the original payment.', { amount: ['Too high'] })
  }

  const refund = await prisma.payment.create({
    data: {
      tenantId: original.tenantId,
      invoiceId: original.invoiceId,
      amount: input.amount,
      method: original.method,
      isRefund: true,
      originalPaymentId: original.id,
      transactionRef: input.reason,
      recordedByUserId: refundedByUserId,
    },
  })
  await recomputeInvoiceStatus(original.invoiceId)
  await logActivity(`refunded ${input.amount}`, { entity: 'Payment', entityId: refund.id, action: 'REFUND' })
  return refund
}
