import { z } from 'zod'
import { PersonType } from '@prisma/client'

export const bookInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().min(1, 'Author is required').max(120),
  publisher: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  isbn: z.string().trim().max(30).optional(),
  totalCopies: z.coerce.number().int().min(1).max(1000),
})
export type BookInput = z.infer<typeof bookInputSchema>

export const listBooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
})
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>

export const issueBookSchema = z.object({
  bookId: z.string().min(1, 'Book is required'),
  ownerType: z.nativeEnum(PersonType),
  ownerId: z.string().min(1, 'Owner is required'),
  dueDate: z.coerce.date(),
})
export type IssueBookInput = z.infer<typeof issueBookSchema>

export const listIssuesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  bookId: z.string().trim().optional(),
  ownerType: z.nativeEnum(PersonType).optional(),
  ownerId: z.string().trim().optional(),
})
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>
