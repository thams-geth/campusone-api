import type { Request, Response } from 'express'
import { searchQuerySchema } from './search.schema'
import * as searchService from './search.service'

export async function search(req: Request, res: Response) {
  const { q } = searchQuerySchema.parse(req.query)
  res.json(await searchService.globalSearch(req.auth!.tenantId, req.auth!.role, q))
}
