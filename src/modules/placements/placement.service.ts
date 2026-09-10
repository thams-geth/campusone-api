import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import { resolveOwnStudentId } from '../shared/studentContext'
import { getCgpaForStudent } from '../examinations/examination.service'
import type {
  ApplyToJobInput,
  CompanyInput,
  JobOpeningInput,
  ListApplicationsQuery,
  ListJobOpeningsQuery,
  UpdateApplicationStatusInput,
} from './placement.schema'

// ---- Companies ----

export async function listCompanies() {
  return prisma.company.findMany({ orderBy: { name: 'asc' } })
}

export async function createCompany(tenantId: string, input: CompanyInput) {
  const existing = await prisma.company.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })
  if (existing) throw ApiError.conflict(`Company "${input.name}" already exists.`, 'DUPLICATE_COMPANY')

  const company = await prisma.company.create({ data: { tenantId, ...input } })
  await logActivity(`added ${company.name} as a placement partner`, { entity: 'Company', entityId: company.id, action: 'CREATE' })
  return company
}

export async function deleteCompany(id: string) {
  const existing = await prisma.company.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Company not found')

  const openingCount = await prisma.jobOpening.count({ where: { companyId: id } })
  if (openingCount > 0) throw ApiError.conflict('Cannot delete a company that still has job openings.', 'COMPANY_IN_USE')

  await prisma.company.delete({ where: { id } })
  await logActivity(`removed ${existing.name} as a placement partner`, { entity: 'Company', entityId: id, action: 'DELETE' })
}

// ---- Job openings ----

export async function listJobOpenings(params: ListJobOpeningsQuery) {
  const { page, pageSize, companyId } = params
  const where = { ...(companyId ? { companyId } : {}) }

  const [data, total] = await Promise.all([
    prisma.jobOpening.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.jobOpening.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getJobOpening(id: string) {
  const opening = await prisma.jobOpening.findUnique({ where: { id } })
  if (!opening) throw ApiError.notFound('Job opening not found')
  return opening
}

export async function createJobOpening(tenantId: string, input: JobOpeningInput) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } })
  if (!company) throw ApiError.badRequest('Company not found.', { companyId: ['Invalid company'] })

  const opening = await prisma.jobOpening.create({ data: { tenantId, ...input } })
  await logActivity(`posted the ${opening.title} opening`, { entity: 'JobOpening', entityId: opening.id, action: 'CREATE' })
  return opening
}

export async function deleteJobOpening(id: string) {
  const existing = await prisma.jobOpening.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Job opening not found')

  const applicationCount = await prisma.placementApplication.count({ where: { jobOpeningId: id } })
  if (applicationCount > 0) throw ApiError.conflict('Cannot delete an opening that has applications.', 'OPENING_IN_USE')

  await prisma.jobOpening.delete({ where: { id } })
  await logActivity(`removed the ${existing.title} opening`, { entity: 'JobOpening', entityId: id, action: 'DELETE' })
}

// ---- Applications ----

export async function applyToJob(tenantId: string, callerUserId: string, jobOpeningId: string, input: ApplyToJobInput) {
  const opening = await prisma.jobOpening.findUnique({ where: { id: jobOpeningId } })
  if (!opening) throw ApiError.notFound('Job opening not found')
  if (opening.applicationDeadline && opening.applicationDeadline < new Date()) {
    throw ApiError.conflict('The application deadline for this opening has passed.', 'DEADLINE_PASSED')
  }

  const studentId = await resolveOwnStudentId(callerUserId, input.studentId)

  if (opening.minCgpa != null) {
    const { cgpa } = await getCgpaForStudent(studentId)
    if (cgpa < opening.minCgpa) {
      throw ApiError.conflict(`This opening requires a minimum CGPA of ${opening.minCgpa}.`, 'CGPA_NOT_MET')
    }
  }

  const existing = await prisma.placementApplication.findUnique({
    where: { studentId_jobOpeningId: { studentId, jobOpeningId } },
  })
  if (existing) throw ApiError.conflict('You have already applied to this opening.', 'ALREADY_APPLIED')

  const application = await prisma.placementApplication.create({ data: { tenantId, studentId, jobOpeningId } })
  await logActivity(`applied to ${opening.title}`, { entity: 'PlacementApplication', entityId: application.id, action: 'CREATE' })
  return application
}

export async function listApplications(params: ListApplicationsQuery) {
  const { page, pageSize, jobOpeningId, studentId, status } = params
  const where = { ...(jobOpeningId ? { jobOpeningId } : {}), ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) }

  const [data, total] = await Promise.all([
    prisma.placementApplication.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.placementApplication.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function listMyApplications(callerUserId: string) {
  const studentId = await resolveOwnStudentId(callerUserId, undefined)
  return prisma.placementApplication.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } })
}

export async function updateApplicationStatus(id: string, input: UpdateApplicationStatusInput) {
  const application = await prisma.placementApplication.findUnique({ where: { id } })
  if (!application) throw ApiError.notFound('Application not found')
  if (application.status === 'SELECTED' || application.status === 'REJECTED') {
    throw ApiError.conflict(`This application is already ${application.status.toLowerCase()}.`, 'APPLICATION_FINALIZED')
  }

  const updated = await prisma.placementApplication.update({
    where: { id },
    data: { status: input.status, notes: input.notes, offeredCtc: input.offeredCtc },
  })
  await logActivity(`updated a placement application to ${input.status}`, {
    entity: 'PlacementApplication',
    entityId: id,
    action: 'UPDATE_STATUS',
    before: { status: application.status },
    after: { status: input.status },
  })
  return updated
}
