import { connectDB } from './database';
import { updateLetterboxdMeta } from './letterboxd_meta';
import { updateFilmMetadata } from './metadata';

async function main() {
    const db = await connectDB();

    await updateFilmMetadata(db);

    await updateLetterboxdMeta(db, true);

    await db.destroy();
}

main();
