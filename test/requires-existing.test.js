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

describe('Propagation.RequiresExisting', () => {
  let transact;
  let withTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ transact, withTransaction } = createTransact(getDb()));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('throws when no transaction is active', async () => {
    await rejects(
      () => withTransaction(async () => {}),
      /Propagation\.RequiresExisting requires an active transaction/,
    );
  });

  it('joins the existing transaction when one is active', async () => {
    let innerTx;
    await transact(async (outerTx) => {
      await withTransaction(async (tx) => {
        innerTx = tx;
      });
      eq(outerTx, innerTx);
    });
  });

  it('changes made within fn are visible after the outer transaction commits', async () => {
    await transact(async () => {
      await withTransaction(async (innerTx) => {
        await innerTx.insert(widgets).values({ name: 'committed' });
      });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'committed');
  });

  it('changes made within fn are rolled back if the outer transaction rolls back', async () => {
    await rejects(
      () =>
        transact(async () => {
          await withTransaction(async (innerTx) => {
            await innerTx.insert(widgets).values({ name: 'doomed' });
          });
          throw new Error('outer failure');
        }),
      /outer failure/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('returns the value of fn', async () => {
    const result = await transact(async () => {
      return withTransaction(async () => 99);
    });
    eq(result, 99);
  });
});
