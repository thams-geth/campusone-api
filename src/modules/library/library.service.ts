import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'
import { logActivity } from '../shared/activityLog'
import type { BookInput, IssueBookInput, ListBooksQuery, ListIssuesQuery } from './library.schema'

const FINE_PER_DAY_LATE = 10

export async function listBooks(params: ListBooksQuery) {
  const { page, pageSize, search, category } = params
  const where = {
    ...(category ? { category } : {}),
    ...(search
      ? { OR: [{ title: { contains: search, mode: 'insensitive' as const } }, { author: { contains: search, mode: 'insensitive' as const } }] }
      : {}),
  }

  const [data, total] = await Promise.all([
    prisma.book.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { title: 'asc' } }),
    prisma.book.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

export async function getBook(id: string) {
  const book = await prisma.book.findUnique({ where: { id } })
  if (!book) throw ApiError.notFound('Book not found')
  return book
}

export async function createBook(tenantId: string, input: BookInput) {
  const book = await prisma.book.create({ data: { tenantId, ...input, availableCopies: input.totalCopies } })
  await logActivity(`added the book "${book.title}"`, { entity: 'Book', entityId: book.id, action: 'CREATE' })
  return book
}

export async function updateBook(id: string, input: BookInput) {
  const existing = await prisma.book.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Book not found')

  // Preserve however many copies are currently out when the catalogue
  // total changes, rather than resetting availability outright.
  const copiesOut = existing.totalCopies - existing.availableCopies
  const availableCopies = Math.max(0, input.totalCopies - copiesOut)

  const book = await prisma.book.update({ where: { id }, data: { ...input, availableCopies } })
  await logActivity(`updated the book "${book.title}"`, { entity: 'Book', entityId: id, action: 'UPDATE' })
  return book
}

export async function deleteBook(id: string) {
  const existing = await prisma.book.findUnique({ where: { id } })
  if (!existing) throw ApiError.notFound('Book not found')

  const issueCount = await prisma.bookIssue.count({ where: { bookId: id } })
  if (issueCount > 0) throw ApiError.conflict('Cannot delete a book with issue history.', 'BOOK_IN_USE')

  await prisma.book.delete({ where: { id } })
  await logActivity(`removed the book "${existing.title}"`, { entity: 'Book', entityId: id, action: 'DELETE' })
}

export async function listIssues(params: ListIssuesQuery) {
  const { page, pageSize, bookId, ownerType, ownerId } = params
  const where = { ...(bookId ? { bookId } : {}), ...(ownerType ? { ownerType } : {}), ...(ownerId ? { ownerId } : {}) }

  const [data, total] = await Promise.all([
    prisma.bookIssue.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { issuedAt: 'desc' } }),
    prisma.bookIssue.count({ where }),
  ])
  return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } }
}

/** Resolves the caller to whichever of Student/Faculty they're linked to — same owner pattern as Documents. */
export async function listMyIssues(callerUserId: string) {
  const [student, faculty] = await Promise.all([
    prisma.student.findUnique({ where: { userId: callerUserId } }),
    prisma.faculty.findUnique({ where: { userId: callerUserId } }),
  ])
  const owner = student ? { ownerType: 'STUDENT' as const, ownerId: student.id } : faculty ? { ownerType: 'FACULTY' as const, ownerId: faculty.id } : null
  if (!owner) return []

  return prisma.bookIssue.findMany({ where: owner, orderBy: { issuedAt: 'desc' } })
}

export async function issueBook(tenantId: string, input: IssueBookInput) {
  const book = await prisma.book.findUnique({ where: { id: input.bookId } })
  if (!book) throw ApiError.badRequest('Book not found.', { bookId: ['Invalid book'] })
  if (book.availableCopies <= 0) throw ApiError.conflict('No copies of this book are currently available.', 'NO_COPIES_AVAILABLE')

  const owner =
    input.ownerType === 'STUDENT'
      ? await prisma.student.findUnique({ where: { id: input.ownerId } })
      : await prisma.faculty.findUnique({ where: { id: input.ownerId } })
  if (!owner) throw ApiError.badRequest('Owner not found.', { ownerId: ['Invalid owner'] })

  const [issue] = await Promise.all([
    prisma.bookIssue.create({ data: { tenantId, ...input } }),
    prisma.book.update({ where: { id: input.bookId }, data: { availableCopies: { decrement: 1 } } }),
  ])
  await logActivity(`issued the book "${book.title}"`, { entity: 'BookIssue', entityId: issue.id, action: 'CREATE' })
  return issue
}

export async function returnBook(id: string) {
  const issue = await prisma.bookIssue.findUnique({ where: { id } })
  if (!issue) throw ApiError.notFound('Book issue not found')
  if (issue.returnedAt) throw ApiError.conflict('This book has already been returned.', 'ALREADY_RETURNED')

  const now = new Date()
  const daysLate = Math.max(0, Math.ceil((now.getTime() - issue.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
  const fineAmount = daysLate > 0 ? daysLate * FINE_PER_DAY_LATE : null

  const [updated] = await Promise.all([
    prisma.bookIssue.update({ where: { id }, data: { returnedAt: now, fineAmount } }),
    prisma.book.update({ where: { id: issue.bookId }, data: { availableCopies: { increment: 1 } } }),
  ])
  await logActivity('returned a book', { entity: 'BookIssue', entityId: id, action: 'RETURN' })
  return updated
}
