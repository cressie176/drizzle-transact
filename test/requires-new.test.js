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
const { createTransact } = require('../lib');

describe('Propagation.RequiresNew', () => {
  let newTransaction;
  let ensureTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ newTransaction, ensureTransaction } = createTransact(getDb()));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('starts a new transaction when none is active', async () => {
    await newTransaction(async (tx) => {
      await tx.insert(widgets).values({ name: 'widget-1' });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('starts a new independent transaction when one is already active', async () => {
    let outerTxRef;
    let innerTxRef;

    await newTransaction(async (outerTx) => {
      outerTxRef = outerTx;
      await newTransaction(async (innerTx) => {
        innerTxRef = innerTx;
      });
    });

    eq(outerTxRef !== innerTxRef, true);
  });

  it('inner transaction commits independently — changes visible even if outer rolls back', async () => {
    await rejects(
      () =>
        newTransaction(async (outerTx) => {
          await newTransaction(async (innerTx) => {
            await innerTx.insert(widgets).values({ name: 'inner-committed' });
          });
          throw new Error('outer rollback');
        }),
      /outer rollback/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'inner-committed');
  });

  it('inner transaction rolls back independently — changes not visible even if outer commits', async () => {
    await rejects(
      () =>
        newTransaction(async () => {
          await newTransaction(async (innerTx) => {
            await innerTx.insert(widgets).values({ name: 'inner-doomed' });
            throw new Error('inner rollback');
          });
        }),
      /inner rollback/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('outer transaction is unaffected by inner transaction outcome', async () => {
    await newTransaction(async (outerTx) => {
      await outerTx.insert(widgets).values({ name: 'outer-committed' });

      await rejects(
        () =>
          newTransaction(async (innerTx) => {
            await innerTx.insert(widgets).values({ name: 'inner-doomed' });
            throw new Error('inner rollback');
          }),
        /inner rollback/,
      );
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'outer-committed');
  });

  it('stack is correctly restored after inner transaction — subsequent calls see outer transaction', async () => {
    let outerTxRef;
    let afterInnerTxRef;

    await newTransaction(async (outerTx) => {
      outerTxRef = outerTx;
      await newTransaction(async () => {});
      await ensureTransaction(async (tx) => {
        afterInnerTxRef = tx;
      });
    });

    eq(afterInnerTxRef, outerTxRef);
  });

  it('returns the value from fn', async () => {
    const result = await newTransaction(async () => 42);
    eq(result, 42);
  });
});
