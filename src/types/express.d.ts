declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string
        tenantId: string
        role: string
      }
      requestId?: string
    }
  }
}

export {}
