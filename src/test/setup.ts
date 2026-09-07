import 'dotenv/config'

// Safe, non-secret defaults so tests don't need a real .env file (e.g.
// in CI). Loading dotenv first means a real local .env always wins —
// these are fallbacks for whatever it doesn't provide, not overrides.
process.env.NODE_ENV ??= 'test'
process.env.DATABASE_URL ??= 'postgresql://campusone:campusone_dev_password@localhost:5432/campusone_test?schema=public'
process.env.APP_DATABASE_URL ??=
  'postgresql://campusone_app:campusone_app_dev_password@localhost:5432/campusone_test?schema=public'
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-not-for-production-use'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-not-for-production-use'
