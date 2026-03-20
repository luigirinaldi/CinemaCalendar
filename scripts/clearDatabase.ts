import 'dotenv/config';
import { connectDB } from './database';

async function main() {
    const db = await connectDB();

    try {
        // Delete in order: showings → films → cinemas (respects foreign keys)
        const { numDeletedRows: showings } = await db
            .deleteFrom('new_showings')
            .executeTakeFirstOrThrow();
        console.log(`🗑️  Deleted ${showings} showings`);

        const { numDeletedRows: films } = await db
            .deleteFrom('new_films')
            .executeTakeFirstOrThrow();
        console.log(`🗑️  Deleted ${films} films`);

        const { numDeletedRows: cinemas } = await db
            .deleteFrom('new_cinemas')
            .executeTakeFirstOrThrow();
        console.log(`🗑️  Deleted ${cinemas} cinemas`);

        console.log('✅ Database cleared successfully');
    } finally {
        await db.destroy();
    }
}

main();
