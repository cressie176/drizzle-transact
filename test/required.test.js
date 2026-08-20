const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq, deepEqual: deq, rejects } = require('node:assert');
const { connect, createTables, truncateTables, dropTables, close, getDb, widgets } = require('./lib/database/init-database');
const { createTransact, Propagation } = require('../lib');

describe('Propagation.Required', () => {
  let transact;

  before(async () => {
    await connect();
    await createTables();
    ({ transact } = createTransact(getDb()));
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

  it('joins an existing transaction when one is active', async () => {
    let innerTx;
    await transact(async (outerTx) => {
      await transact(async (tx) => {
        innerTx = tx;
      });
      eq(outerTx, innerTx);
    });
  });

  it('nested Required calls share the same transaction object', async () => {
    const seen = [];
    await transact(async (tx1) => {
      seen.push(tx1);
      await transact(async (tx2) => {
        seen.push(tx2);
        await transact(async (tx3) => {
          seen.push(tx3);
        });
      });
    });
    eq(seen[0], seen[1]);
    eq(seen[1], seen[2]);
  });

  it('returns the value from fn', async () => {
    const result = await transact(async () => 42);
    eq(result, 42);
  });

  it('rolls back and rethrows on error', async () => {
    await rejects(
      () =>
        transact(async (tx) => {
          await tx.insert(widgets).values({ name: 'doomed' });
          throw new Error('boom');
        }),
      /boom/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('commits on success — changes are visible after', async () => {
    await transact(async (tx) => {
      await tx.insert(widgets).values({ name: 'persisted' });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'persisted');
  });

  it('uses the default propagation from createTransact', async () => {
    const { transact: t } = createTransact(getDb(), { propagation: Propagation.Required });
    const result = await t(async () => 'default');
    eq(result, 'default');
  });

  it('propagates the transaction implicitly — inner function does not receive tx', async () => {
    async function insertWidget(name) {
      await transact(async (tx) => {
        await tx.insert(widgets).values({ name });
      });
    }

    await transact(async () => {
      await insertWidget('widget-1');
      await insertWidget('widget-2');
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 2);
  });

  it('per-call propagation overrides the default', async () => {
    const { transact: t } = createTransact(getDb(), { propagation: Propagation.Required });
    await t(async (tx) => {
      await tx.insert(widgets).values({ name: 'override' });
    }, { propagation: Propagation.Required });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
  });
});
