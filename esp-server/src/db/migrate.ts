import { readFileSync } from 'fs';
import { join } from 'path';
import sql from './client';

/**
 * Reads schema.sql from the same directory and executes all DDL statements.
 * Safe to call on every startup — all statements use CREATE TABLE IF NOT EXISTS.
 */
export async function runMigrations(): Promise<void> {
  const schemaPath = join(__dirname, 'schema.sql');
  const ddl = readFileSync(schemaPath, 'utf-8');

  await sql.unsafe(ddl);

  console.log('[DB] Migrations applied');
}
