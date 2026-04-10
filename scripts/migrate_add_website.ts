/**
 * One-time migration: add `website` column to new_cinemas table.
 * Safe to re-run (uses IF NOT EXISTS).
 */
import 'dotenv/config';
import { sql } from 'kysely';
import { connectDB } from './database';

async function main() {
    const db = await connectDB();
    try {
        await sql`ALTER TABLE new_cinemas ADD COLUMN IF NOT EXISTS website text`.execute(db);
        console.log('✅ Column "website" added to new_cinemas (or already existed)');
    } finally {
        await db.destroy();
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
