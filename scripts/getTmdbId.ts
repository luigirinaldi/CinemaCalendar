import { connectDB } from './database';
import { updateFilmMetadata } from './metadata';
import { startRunLog } from './runLog';

async function main() {
    startRunLog('get-tmdb-id');
    const db = await connectDB();
    try {
        await updateFilmMetadata(db);
    } finally {
        await db.destroy();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
