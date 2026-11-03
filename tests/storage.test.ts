import test from 'node:test';
import assert from 'node:assert/strict';
import {
    Kysely,
    PostgresAdapter,
    PostgresIntrospector,
    PostgresQueryCompiler,
    type CompiledQuery,
    type DatabaseConnection,
    type Driver,
    type QueryResult,
} from 'kysely';
import { storeCinemaData, type DB } from '../scripts/database';

test('the writer retains existing future screenings and deduplicates incoming showings', async (t) => {
    t.mock.method(console, 'log', () => {});
    const queries: CompiledQuery[] = [];
    const existingTime = new Date(Date.now() + 86400000).toISOString();
    const newTime = new Date(Date.now() + 172800000).toISOString();
    const connection: DatabaseConnection = {
        async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
            queries.push(query);
            let rows: object[] = [];
            if (query.sql.startsWith('insert into "new_cinemas"'))
                rows = [{ id: 1 }];
            else if (query.sql.startsWith('select * from "new_films"'))
                rows = [
                    {
                        id: 10,
                        title: 'Test film',
                        url: 'https://cinema.test/film',
                    },
                ];
            else if (query.sql.startsWith('select * from "new_showings"'))
                rows = [{ film_id: 10, start_time: existingTime }];
            else if (query.sql.startsWith('insert into "new_showings"'))
                rows = [{ id: 20 }];
            return { rows: rows as R[] };
        },
        async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
            yield { rows: [] };
        },
    };
    const driver: Driver = {
        async init() {},
        async destroy() {},
        async acquireConnection() {
            return connection;
        },
        async releaseConnection() {},
        async beginTransaction() {},
        async commitTransaction() {},
        async rollbackTransaction() {},
    };
    const db = new Kysely<DB>({
        dialect: {
            createDriver: () => driver,
            createAdapter: () => new PostgresAdapter(),
            createQueryCompiler: () => new PostgresQueryCompiler(),
            createIntrospector: (database) =>
                new PostgresIntrospector(database),
        },
    });
    try {
        await db.transaction().execute((trx) =>
            storeCinemaData(trx, {
                cinema: {
                    name: 'Test cinema',
                    location: 'London',
                    defaultLanguage: 'en-GB',
                },
                showings: [
                    {
                        film: {
                            title: 'Test film',
                            url: 'https://cinema.test/film',
                        },
                        showings: [
                            { startTime: existingTime },
                            { startTime: newTime },
                            { startTime: newTime },
                        ],
                    },
                ],
            })
        );
        assert.equal(
            queries.some((query) => /\bdelete\b/i.test(query.sql)),
            false
        );
        assert.ok(
            queries.some((query) => query.sql.includes('pg_advisory_xact_lock'))
        );
        const inserts = queries.filter((query) =>
            query.sql.startsWith('insert into "new_showings"')
        );
        assert.equal(inserts.length, 1);
        assert.equal(
            inserts[0].parameters.filter((value) => value === newTime).length,
            1
        );
        assert.equal(inserts[0].parameters.includes(existingTime), false);
    } finally {
        await db.destroy();
    }
});
