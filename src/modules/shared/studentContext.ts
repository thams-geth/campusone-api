import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'

/**
 * Resolves "which student is this" for self-service routes (leave
 * requests, assignment submissions, viewing own marks/attendance).
 * An explicit id lets staff/faculty act on a student's behalf;
 * omitted, it resolves the caller's own linked Student record (see
 * Student.userId — nullable, so not every account has one).
 */
export async function resolveOwnStudentId(callerUserId: string, explicitStudentId: string | undefined): Promise<string> {
  if (explicitStudentId) {
    const student = await prisma.student.findUnique({ where: { id: explicitStudentId } })
    if (!student) throw ApiError.badRequest('Student not found.', { studentId: ['Invalid student'] })
    return student.id
  }

  const ownProfile = await prisma.student.findUnique({ where: { userId: callerUserId } })
  if (!ownProfile) {
    throw ApiError.badRequest('You have no linked student profile — pass an explicit studentId.', {
      studentId: ['Required'],
    })
  }
  return ownProfile.id
}
