import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  // Present once the account has MFA enabled; the client re-submits the
  // same login call with this filled in after seeing MFA_REQUIRED.
  mfaCode: z.string().trim().min(1).optional(),
})
export type LoginInput = z.infer<typeof loginSchema>

export const mfaCodeSchema = z.object({
  code: z.string().trim().min(1, 'Code is required'),
})
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
