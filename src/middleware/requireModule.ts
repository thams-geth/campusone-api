import type { NextFunction, Request, Response } from 'express'
import type { ModuleId } from '@prisma/client'
import { ApiError } from '../utils/ApiError'
import { prisma } from '../prisma/client'

/**
 * Module-entitlement guard (CLAUDE.md's module system: "every API route
 * checks module entitlement before executing — a disabled module must
 * 403, not just hide the UI button"). CORE is implied always-on and
 * isn't stored in TenantModule at all, matching that table's doc
 * comment, so it always passes without a query.
 */
export function requireModule(moduleId: ModuleId) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (moduleId === 'CORE') {
      next()
      return
    }
    if (!req.auth) {
      next(ApiError.unauthorized())
      return
    }

    const tenantModule = await prisma.tenantModule.findUnique({
      where: { tenantId_moduleId: { tenantId: req.auth.tenantId, moduleId } },
    })
    if (!tenantModule?.enabled) {
      next(ApiError.forbidden(`The ${moduleId} module is not enabled for this tenant.`))
      return
    }
    next()
  }
}
