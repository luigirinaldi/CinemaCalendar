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
    type Transaction,
} from 'kysely';
import {
    dryRunStoreCinemaData,
    storeCinemaData,
    type DB,
} from '../scripts/database';

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

test('dry-run reports unique additions and retention, with the writer film identity and no writes', async (t) => {
    const logs: string[] = [];
    t.mock.method(console, 'log', (message: string) => logs.push(message));
    const films = [
        { id: 10, title: 'Same title', url: 'https://cinema.test/a' },
        { id: 11, title: 'Same title', url: 'https://cinema.test/b' },
    ];
    const past = '2020-01-01T20:00:00Z';
    const future = '2099-01-01T20:00:00Z';
    const showings = [
        { film_id: 10, start_time: past },
        { film_id: 11, start_time: future },
    ];
    const reads: string[] = [];
    let cinemaExists = true;
    // Only read methods exist: attempting any mutation fails the test.
    const trx = {
        selectFrom(table: string) {
            reads.push(table);
            return {
                select() {
                    return this;
                },
                selectAll() {
                    return this;
                },
                where() {
                    return this;
                },
                async executeTakeFirst() {
                    return cinemaExists ? { id: 1 } : undefined;
                },
                async execute() {
                    return table === 'new_films' ? films : showings;
                },
            };
        },
    } as unknown as Transaction<DB>;
    const input = {
        cinema: {
            name: 'Test cinema',
            location: 'London',
            defaultLanguage: 'en-GB',
        },
        showings: [
            {
                film: { title: 'Same title', url: 'https://cinema.test/a' },
                showings: [
                    { startTime: past },
                    { startTime: future },
                    { startTime: future },
                ],
            },
            {
                film: { title: 'New film', url: 'https://cinema.test/new' },
                showings: [{ startTime: future }, { startTime: future }],
            },
        ],
    };
    await dryRunStoreCinemaData(trx, input);
    assert.deepEqual(reads, ['new_cinemas', 'new_films', 'new_showings']);
    assert.equal(logs.filter((line) => line.includes(' + ')).length, 2);
    assert.ok(
        logs.some((line) => line.includes('Retaining 1 stored screenings'))
    );
    assert.equal(
        logs.some((line) => line.includes(' - ')),
        false
    );
    assert.equal(
        logs.some((line) => line.includes(past)),
        false
    );

    logs.length = 0;
    await dryRunStoreCinemaData(trx, { ...input, showings: [] });
    assert.ok(
        logs.some((line) => line.includes('No new screenings to insert'))
    );
    assert.ok(
        logs.some((line) => line.includes('Retaining 2 stored screenings'))
    );

    cinemaExists = false;
    logs.length = 0;
    reads.length = 0;
    await dryRunStoreCinemaData(trx, input);
    assert.deepEqual(reads, ['new_cinemas']);
    assert.ok(logs.some((line) => line.includes('would be inserted')));
    assert.equal(logs.filter((line) => line.includes(' + ')).length, 3);
    assert.ok(
        logs.some((line) => line.includes('Retaining 0 stored screenings'))
    );
});
