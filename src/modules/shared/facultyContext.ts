import { ApiError } from '../../utils/ApiError'
import { prisma } from '../../prisma/client'

/**
 * Resolves "which faculty member is this" for routes a faculty member
 * performs against their own class (attendance sessions, assignments).
 * An explicit id lets an admin act on a faculty member's behalf;
 * omitted, it resolves the caller's own linked Faculty record.
 */
export async function resolveOwnFacultyId(callerUserId: string, explicitFacultyId: string | undefined): Promise<string> {
  if (explicitFacultyId) {
    const faculty = await prisma.faculty.findUnique({ where: { id: explicitFacultyId } })
    if (!faculty) throw ApiError.badRequest('Faculty member not found.', { facultyId: ['Invalid faculty'] })
    return faculty.id
  }

  const ownProfile = await prisma.faculty.findUnique({ where: { userId: callerUserId } })
  if (!ownProfile) {
    throw ApiError.badRequest(
      'You have no faculty profile — pass an explicit facultyId to act on their behalf.',
      { facultyId: ['Required'] },
    )
  }
  return ownProfile.id
}
