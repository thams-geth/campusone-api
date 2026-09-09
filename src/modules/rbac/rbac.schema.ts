import { z } from 'zod'

export const assignRoleSchema = z.object({
  roleName: z.string().trim().min(1, 'Role is required'),
})

export type AssignRoleInput = z.infer<typeof assignRoleSchema>
