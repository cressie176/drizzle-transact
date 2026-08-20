const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq, rejects } = require('node:assert');
const {
  connect,
  createTables,
  truncateTables,
  dropTables,
  close,
  getDb,
  widgets,
} = require('./lib/database/init-database');
const { createTransact, Propagation } = require('../lib');

describe('Propagation.Never', () => {
  let transact;

  before(async () => {
    await connect();
    await createTables();
    ({ transact } = createTransact(getDb(), { propagation: Propagation.Never }));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('throws when a transaction is active', async () => {
    const { transact: transactRequired } = createTransact(getDb(), { propagation: Propagation.Required });
    await rejects(
      () => transactRequired(async () => transact(async () => {})),
      /Propagation\.Never: an active transaction was found but none was expected/,
    );
  });

  it('runs without a transaction when none is active', async () => {
    await transact(async (conn) => {
      await conn.insert(widgets).values({ name: 'widget-1' });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('does not roll back prior changes when fn throws', async () => {
    await getDb().insert(widgets).values({ name: 'before-never' });

    await rejects(
      () =>
        transact(async () => {
          throw new Error('boom');
        }),
      /boom/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'before-never');
  });

  it('returns the value of fn', async () => {
    const result = await transact(async () => 42);
    eq(result, 42);
  });
});
