import { z } from 'zod'

export const institutionUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(160),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex color, e.g. "#1677FF"')
    .optional()
    .or(z.literal('')),
})

export type InstitutionUpdateInput = z.infer<typeof institutionUpdateSchema>
