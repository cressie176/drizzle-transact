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
const { createTransact, adoptTransaction, adoptDatabase } = require('../lib');

describe('adoptDatabase', () => {
  let newTransaction;
  let ensureTransaction;
  let withTransaction;
  let nestTransaction;
  let withoutTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ newTransaction, ensureTransaction, withTransaction, nestTransaction, withoutTransaction } = createTransact(
      getDb(),
    ));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('makes the adopted handle active — ensureTransaction and withTransaction join it', async () => {
    const handle = makeUntransactableHandle();
    await adoptDatabase(handle, async () => {
      await ensureTransaction(async (tx) => eq(tx, handle));
      await withTransaction(async (tx) => eq(tx, handle));
    });
  });

  it('newTransaction runs flat on the adopted handle without calling transaction()', async () => {
    const handle = makeUntransactableHandle();
    await adoptDatabase(handle, async () => {
      await newTransaction(async (tx) => {
        eq(tx, handle);
        const rows = await tx.select().from(widgets);
        eq(rows.length, 0);
      });
    });
  });

  it('nestTransaction runs flat on the adopted handle without calling transaction()', async () => {
    const handle = makeUntransactableHandle();
    await adoptDatabase(handle, async () => {
      await nestTransaction(async (tx) => {
        eq(tx, handle);
        const rows = await tx.select().from(widgets);
        eq(rows.length, 0);
      });
    });
  });

  it('newTransaction changes roll back with an adopted external transaction — no independent commit', async () => {
    await rejects(
      () =>
        getDb().transaction(async (externalTx) => {
          await adoptDatabase(externalTx, async () => {
            await newTransaction(async (tx) => {
              await tx.insert(widgets).values({ name: 'doomed' });
            });
          });
          throw new Error('external failure');
        }),
      /external failure/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('newTransaction commits independently under adoptTransaction — pinning the difference between the two adoptions', async () => {
    await rejects(
      () =>
        getDb().transaction(async (externalTx) => {
          await adoptTransaction(externalTx, async () => {
            await newTransaction(async (tx) => {
              await tx.insert(widgets).values({ name: 'survivor' });
            });
          });
          throw new Error('external failure');
        }),
      /external failure/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'survivor');
  });

  it('passes the adopted handle to fn', async () => {
    const handle = makeUntransactableHandle();
    await adoptDatabase(handle, async (db) => eq(db, handle));
  });

  it('returns the value of fn', async () => {
    const result = await adoptDatabase(makeUntransactableHandle(), async () => 99);
    eq(result, 99);
  });

  it('restores the stack after the adopted scope — withTransaction throws again outside it', async () => {
    await adoptDatabase(makeUntransactableHandle(), async () => {});
    await rejects(
      () => withTransaction(async () => {}),
      /Propagation\.RequiresExisting requires an active transaction/,
    );
  });

  it('withoutTransaction throws inside an adopted scope', async () => {
    await adoptDatabase(makeUntransactableHandle(), async () => {
      await rejects(() => withoutTransaction(async () => {}), /Propagation\.Never: an active transaction was found/);
    });
  });

  function makeUntransactableHandle() {
    return new Proxy(getDb(), {
      get(target, property, receiver) {
        if (property === 'transaction') throw new Error('Transactions are not supported by this handle');
        return Reflect.get(target, property, receiver);
      },
    });
  }
});
