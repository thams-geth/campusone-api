import { z } from 'zod'
import { DocumentOwnerType, DocumentType } from '@prisma/client'

export const documentInputSchema = z.object({
  ownerType: z.nativeEnum(DocumentOwnerType),
  ownerId: z.string().min(1, 'Owner is required'),
  type: z.nativeEnum(DocumentType),
  fileUrl: z.string().trim().url('Must be a valid URL'),
  expiryDate: z.coerce.date().optional(),
})
export type DocumentInput = z.infer<typeof documentInputSchema>

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ownerType: z.nativeEnum(DocumentOwnerType).optional(),
  ownerId: z.string().trim().optional(),
  type: z.nativeEnum(DocumentType).optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
})
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>
