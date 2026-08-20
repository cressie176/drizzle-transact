const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq, rejects } = require('node:assert');
const { connect, createTables, truncateTables, dropTables, close, getDb, widgets } = require('./lib/database/init-database');
const { createTransact, Propagation } = require('../lib');

describe('Propagation.RequiresNew', () => {
  let transact;

  before(async () => {
    await connect();
    await createTables();
    ({ transact } = createTransact(getDb(), { propagation: Propagation.RequiresNew }));
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

  it('starts a new independent transaction when one is already active', async () => {
    let outerTxRef;
    let innerTxRef;

    await transact(async (outerTx) => {
      outerTxRef = outerTx;
      await transact(async (innerTx) => {
        innerTxRef = innerTx;
      });
    });

    eq(outerTxRef !== innerTxRef, true);
  });

  it('inner transaction commits independently — changes visible even if outer rolls back', async () => {
    await rejects(
      () =>
        transact(async (outerTx) => {
          await transact(async (innerTx) => {
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
        transact(async () => {
          await transact(async (innerTx) => {
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
    await transact(async (outerTx) => {
      await outerTx.insert(widgets).values({ name: 'outer-committed' });

      await rejects(
        () =>
          transact(async (innerTx) => {
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

    await transact(async (outerTx) => {
      outerTxRef = outerTx;
      await transact(async () => {});
      await transact(async (tx) => {
        afterInnerTxRef = tx;
      }, { propagation: Propagation.Required });
    });

    eq(afterInnerTxRef, outerTxRef);
  });

  it('returns the value from fn', async () => {
    const result = await transact(async () => 42);
    eq(result, 42);
  });
});
