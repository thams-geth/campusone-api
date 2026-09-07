// Safe, non-secret defaults so tests don't need a real .env file.
// Real env values (loaded via .env in dev, real secrets in prod) always
// take precedence — this only fills in what's missing.
process.env.NODE_ENV ??= 'test'
process.env.DATABASE_URL ??= 'postgresql://campusone:campusone_dev_password@localhost:5432/campusone_test?schema=public'
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-not-for-production-use'
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-not-for-production-use'
