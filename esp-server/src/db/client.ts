import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'Please provide a valid PostgreSQL connection string.'
  );
}

/**
 * Singleton postgres.js connection pool.
 * Import this `sql` instance in other modules to run queries.
 */
const sql = postgres(connectionString);

export default sql;
