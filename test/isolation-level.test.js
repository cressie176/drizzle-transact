const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq } = require('node:assert');
const {
  connect,
  createTables,
  truncateTables,
  dropTables,
  close,
  getDb,
  widgets,
} = require('./lib/database/init-database');
const { createTransact, Propagation, IsolationLevel } = require('../lib');

describe('IsolationLevel', () => {
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

  it('ReadCommitted isolation level is accepted and can perform inserts', async () => {
    const { transact } = createTransact(getDb());
    await transact(
      async (tx) => {
        await tx.insert(widgets).values({ name: 'widget-1' });
      },
      { isolationLevel: IsolationLevel.ReadCommitted },
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('Serializable isolation level is accepted and can perform inserts', async () => {
    const { transact } = createTransact(getDb());
    await transact(
      async (tx) => {
        await tx.insert(widgets).values({ name: 'widget-1' });
      },
      { isolationLevel: IsolationLevel.Serializable },
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('default isolation level from createTransact is applied when no per-call option is given', async () => {
    const { transact } = createTransact(getDb(), { isolationLevel: IsolationLevel.Serializable });
    await transact(async (tx) => {
      await tx.insert(widgets).values({ name: 'widget-1' });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('per-call isolation level overrides the default', async () => {
    const { transact } = createTransact(getDb(), { isolationLevel: IsolationLevel.Serializable });
    await transact(
      async (tx) => {
        await tx.insert(widgets).values({ name: 'widget-1' });
      },
      { isolationLevel: IsolationLevel.ReadCommitted },
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('isolation level is not applied when joining an existing transaction', async () => {
    const { transact } = createTransact(getDb());
    let outerTx;
    let innerTx;

    await transact(async (tx) => {
      outerTx = tx;
      await transact(
        async (tx) => {
          innerTx = tx;
        },
        { isolationLevel: IsolationLevel.Serializable },
      );
    });

    eq(innerTx, outerTx);
  });
});
