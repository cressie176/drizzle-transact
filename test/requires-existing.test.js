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

describe('Propagation.RequiresExisting', () => {
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

  it('throws when no transaction is active', async () => {
    await rejects(
      () => transact(async () => {}, { propagation: Propagation.RequiresExisting }),
      /Propagation\.RequiresExisting requires an active transaction/,
    );
  });

  it('joins the existing transaction when one is active', async () => {
    let innerTx;
    await transact(async (outerTx) => {
      await transact(
        async (tx) => {
          innerTx = tx;
        },
        { propagation: Propagation.RequiresExisting },
      );
      eq(outerTx, innerTx);
    });
  });

  it('changes made within fn are visible after the outer transaction commits', async () => {
    await transact(async (tx) => {
      await transact(
        async (innerTx) => {
          await innerTx.insert(widgets).values({ name: 'committed' });
        },
        { propagation: Propagation.RequiresExisting },
      );
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'committed');
  });

  it('changes made within fn are rolled back if the outer transaction rolls back', async () => {
    await rejects(
      () =>
        transact(async (tx) => {
          await transact(
            async (innerTx) => {
              await innerTx.insert(widgets).values({ name: 'doomed' });
            },
            { propagation: Propagation.RequiresExisting },
          );
          throw new Error('outer failure');
        }),
      /outer failure/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('returns the value of fn', async () => {
    const result = await transact(async () => {
      return transact(async () => 99, { propagation: Propagation.RequiresExisting });
    });
    eq(result, 99);
  });

  it('works correctly when set as the default propagation in createTransact', async () => {
    const { transact: requiresExistingTransact } = createTransact(getDb(), {
      propagation: Propagation.RequiresExisting,
    });

    await rejects(
      () => requiresExistingTransact(async () => {}),
      /Propagation\.RequiresExisting requires an active transaction/,
    );

    let innerTx;
    await transact(async (outerTx) => {
      await requiresExistingTransact(async (tx) => {
        innerTx = tx;
      });
      eq(outerTx, innerTx);
    });
  });
});
