import { Router } from 'express'
import { requireAuth, requirePermission } from '../../middleware/requireAuth'
import { requireModule } from '../../middleware/requireModule'
import * as libraryController from './library.controller'

export const libraryRouter = Router()

libraryRouter.use(requireAuth, requireModule('LIBRARY'))

libraryRouter.get('/books', requirePermission('LIBRARY_READ'), libraryController.listBooks)
libraryRouter.get('/books/:id', requirePermission('LIBRARY_READ'), libraryController.getBook)
libraryRouter.post('/books', requirePermission('LIBRARY_MANAGE'), libraryController.createBook)
libraryRouter.put('/books/:id', requirePermission('LIBRARY_MANAGE'), libraryController.updateBook)
libraryRouter.delete('/books/:id', requirePermission('LIBRARY_MANAGE'), libraryController.removeBook)

libraryRouter.get('/issues', requirePermission('LIBRARY_MANAGE'), libraryController.listIssues)
libraryRouter.get('/issues/mine', requirePermission('LIBRARY_READ'), libraryController.listMyIssues)
libraryRouter.post('/issues', requirePermission('LIBRARY_ISSUE'), libraryController.issueBook)
libraryRouter.post('/issues/:id/return', requirePermission('LIBRARY_ISSUE'), libraryController.returnBook)
