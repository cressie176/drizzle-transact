const { describe, it, before, after, beforeEach } = require('node:test');
const { equal: eq, rejects } = require('node:assert');
const { sql } = require('drizzle-orm');
const {
  connect,
  createTables,
  truncateTables,
  dropTables,
  close,
  getDb,
  widgets,
} = require('./lib/database/init-database');
const { createTransact, adoptTransaction } = require('../lib');

describe('adoptTransaction', () => {
  let ensureTransaction;
  let withTransaction;
  let withoutTransaction;
  let nestTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ ensureTransaction, withTransaction, withoutTransaction, nestTransaction } = createTransact(getDb()));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('makes an externally opened transaction active — ensureTransaction joins it instead of starting a new one', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async () => {
        await ensureTransaction(async (tx) => {
          eq(tx, externalTx);
        });
      });
    });
  });

  it('joined work runs on the same connection as the external transaction', async () => {
    await getDb().transaction(async (externalTx) => {
      const externalPid = await backendPid(externalTx);
      await adoptTransaction(externalTx, async () => {
        await ensureTransaction(async (tx) => {
          eq(await backendPid(tx), externalPid);
        });
      });
    });
  });

  it('makes an externally opened transaction active — withTransaction joins it', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async () => {
        await withTransaction(async (tx) => {
          eq(tx, externalTx);
        });
      });
    });
  });

  it('changes made by joined work roll back with the external transaction', async () => {
    await rejects(
      () =>
        getDb().transaction(async (externalTx) => {
          await adoptTransaction(externalTx, async () => {
            await ensureTransaction(async (tx) => {
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

  it('routes queries through a handle that cannot open transactions, without calling transaction()', async () => {
    const untransactableHandle = makeUntransactableHandle();
    await adoptTransaction(untransactableHandle, async () => {
      await ensureTransaction(async (tx) => {
        eq(tx, untransactableHandle);
        const rows = await tx.select().from(widgets);
        eq(rows.length, 0);
      });
    });
  });

  it('passes the adopted transaction to fn', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async (tx) => {
        eq(tx, externalTx);
      });
    });
  });

  it('returns the value of fn', async () => {
    await getDb().transaction(async (externalTx) => {
      const result = await adoptTransaction(externalTx, async () => 99);
      eq(result, 99);
    });
  });

  it('restores the stack after the adopted scope — withTransaction throws again outside it', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async () => {});
    });
    await rejects(
      () => withTransaction(async () => {}),
      /Propagation\.RequiresExisting requires an active transaction/,
    );
  });

  it('nestTransaction creates a real savepoint on the adopted transaction', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async () => {
        await ensureTransaction(async (tx) => {
          await tx.insert(widgets).values({ name: 'kept' });
        });
        await rejects(
          () =>
            nestTransaction(async (tx) => {
              await tx.insert(widgets).values({ name: 'discarded' });
              throw new Error('nested failure');
            }),
          /nested failure/,
        );
      });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'kept');
  });

  it('withoutTransaction throws inside an adopted scope', async () => {
    await getDb().transaction(async (externalTx) => {
      await adoptTransaction(externalTx, async () => {
        await rejects(() => withoutTransaction(async () => {}), /Propagation\.Never: an active transaction was found/);
      });
    });
  });

  async function backendPid(tx) {
    const result = await tx.execute(sql`SELECT pg_backend_pid() AS pid`);
    return result.rows[0].pid;
  }

  function makeUntransactableHandle() {
    return new Proxy(getDb(), {
      get(target, property, receiver) {
        if (property === 'transaction') throw new Error('Transactions are not supported by this handle');
        return Reflect.get(target, property, receiver);
      },
    });
  }
});
