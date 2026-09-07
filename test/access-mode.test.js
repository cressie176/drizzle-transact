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
const { createTransact, AccessMode } = require('../lib');

function isReadOnlyViolation(error) {
  return /read-only transaction/.test(error.cause?.message ?? error.message);
}

describe('AccessMode', () => {
  before(async () => {
    await connect();
    await createTables();
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('ReadOnly access mode can perform selects', async () => {
    await getDb().insert(widgets).values({ name: 'widget-1' });

    const { transact } = createTransact(getDb());
    const rows = await transact(
      async (tx) => {
        return tx.select().from(widgets);
      },
      { accessMode: AccessMode.ReadOnly },
    );

    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('ReadOnly access mode rejects inserts', async () => {
    const { transact } = createTransact(getDb());
    await rejects(
      transact(
        async (tx) => {
          await tx.insert(widgets).values({ name: 'widget-1' });
        },
        { accessMode: AccessMode.ReadOnly },
      ),
      isReadOnlyViolation,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('ReadWrite access mode is accepted and can perform inserts', async () => {
    const { transact } = createTransact(getDb());
    await transact(
      async (tx) => {
        await tx.insert(widgets).values({ name: 'widget-1' });
      },
      { accessMode: AccessMode.ReadWrite },
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('access mode is not applied when joining an existing transaction', async () => {
    const { transact } = createTransact(getDb());
    let outerTx;
    let innerTx;

    await transact(async (tx) => {
      outerTx = tx;
      await transact(
        async (tx) => {
          innerTx = tx;
          await tx.insert(widgets).values({ name: 'widget-1' });
        },
        { accessMode: AccessMode.ReadOnly },
      );
    });

    eq(innerTx, outerTx);
    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
  });
});
