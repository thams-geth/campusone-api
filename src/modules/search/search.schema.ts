import { z } from 'zod'

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search term must be at least 2 characters'),
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
