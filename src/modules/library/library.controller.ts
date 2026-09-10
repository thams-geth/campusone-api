import type { Request, Response } from 'express'
import { requireParam } from '../../utils/params'
import * as libraryService from './library.service'
import { bookInputSchema, issueBookSchema, listBooksQuerySchema, listIssuesQuerySchema } from './library.schema'

export async function listBooks(req: Request, res: Response) {
  const query = listBooksQuerySchema.parse(req.query)
  res.json(await libraryService.listBooks(query))
}

export async function getBook(req: Request, res: Response) {
  res.json(await libraryService.getBook(requireParam(req, 'id')))
}

export async function createBook(req: Request, res: Response) {
  const input = bookInputSchema.parse(req.body)
  res.status(201).json(await libraryService.createBook(req.auth!.tenantId, input))
}

export async function updateBook(req: Request, res: Response) {
  const input = bookInputSchema.parse(req.body)
  res.json(await libraryService.updateBook(requireParam(req, 'id'), input))
}

export async function removeBook(req: Request, res: Response) {
  await libraryService.deleteBook(requireParam(req, 'id'))
  res.status(204).end()
}

export async function listIssues(req: Request, res: Response) {
  const query = listIssuesQuerySchema.parse(req.query)
  res.json(await libraryService.listIssues(query))
}

export async function listMyIssues(req: Request, res: Response) {
  res.json(await libraryService.listMyIssues(req.auth!.userId))
}

export async function issueBook(req: Request, res: Response) {
  const input = issueBookSchema.parse(req.body)
  res.status(201).json(await libraryService.issueBook(req.auth!.tenantId, input))
}

export async function returnBook(req: Request, res: Response) {
  res.json(await libraryService.returnBook(requireParam(req, 'id')))
}
