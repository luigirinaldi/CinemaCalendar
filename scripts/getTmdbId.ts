import { connectDB } from './database';
import { updateFilmMetadata } from './metadata';

async function main() {
    const db = await connectDB();

    await updateFilmMetadata(db);

    await db.destroy();
}

main();
