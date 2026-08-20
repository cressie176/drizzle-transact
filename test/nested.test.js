const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq, rejects } = require('node:assert');
const { connect, createTables, truncateTables, dropTables, close, getDb, widgets } = require('./lib/database/init-database');
const { createTransact, Propagation } = require('../lib');

describe('Propagation.Nested', () => {
  let transact;

  before(async () => {
    await connect();
    await createTables();
    ({ transact } = createTransact(getDb(), { propagation: Propagation.Nested }));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('starts a new transaction when none is active', async () => {
    await transact(async (tx) => {
      await tx.insert(widgets).values({ name: 'widget-1' });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('creates a savepoint within an existing transaction', async () => {
    let outerTx;
    let innerTx;

    await transact(async (tx) => {
      outerTx = tx;
      await transact(async (tx2) => {
        innerTx = tx2;
      });
    });

    eq(typeof outerTx.transaction, 'function');
    eq(typeof innerTx.transaction, 'function');
    eq(outerTx === innerTx, false);
  });

  it('outer transaction commits when nested block also succeeds', async () => {
    await transact(async (outerTx) => {
      await outerTx.insert(widgets).values({ name: 'outer' });
      await transact(async (innerTx) => {
        await innerTx.insert(widgets).values({ name: 'inner' });
      });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 2);
  });

  it('rolling back a nested block undoes only its own changes, outer transaction can still commit', async () => {
    await transact(async (outerTx) => {
      await outerTx.insert(widgets).values({ name: 'outer' });
      await rejects(
        () =>
          transact(async (innerTx) => {
            await innerTx.insert(widgets).values({ name: 'inner' });
            throw new Error('nested failure');
          }),
        /nested failure/,
      );
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'outer');
  });

  it('rethrows an error from the nested block to the caller', async () => {
    await rejects(
      () =>
        transact(async (outerTx) => {
          await transact(async () => {
            throw new Error('nested error');
          });
        }),
      /nested error/,
    );
  });

  it('returns the value from fn', async () => {
    const result = await transact(async () => 42);
    eq(result, 42);
  });

  it('restores the stack correctly after the nested block completes', async () => {
    let outerTxAfterNested;

    await transact(async (outerTx) => {
      await transact(async () => {});
      outerTxAfterNested = outerTx;
    });

    eq(typeof outerTxAfterNested.transaction, 'function');
  });
});
