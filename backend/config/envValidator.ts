/**
 * @file src/config/envValidator.ts
 * @description Validates required environment variables at boot time.
 */

const requiredEnvVars = [
  'JWT_SECRET',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'INTERNAL_API_KEY',
];

export const validateEnv = (): void => {
  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  // Neon Postgres is the primary datastore.
  if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
    missingVars.push('DATABASE_URL');
  }

  // Upstash Redis is the secondary store (queues, caches, XP buffer).
  if (!process.env.UPSTASH_REDIS_URL && !process.env.REDIS_URL) {
    missingVars.push('UPSTASH_REDIS_URL');
  }

  if (missingVars.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Server is shutting down. Please update your .env file.');
    process.exit(1);
  }

  console.log('[INFO] Environment variables validated successfully.');
};
