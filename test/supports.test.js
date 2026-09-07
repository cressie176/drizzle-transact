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
const { createTransact, adoptTransaction, adoptDatabase, Propagation } = require('../lib');

describe('Propagation.Supports', () => {
  let transact;
  let supportsTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ transact, supportsTransaction } = createTransact(getDb()));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('runs without a transaction when none is active', async () => {
    await transact(
      async (conn) => {
        await conn.insert(widgets).values({ name: 'widget-1' });
      },
      { propagation: Propagation.Supports },
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('does not roll back prior changes when fn throws and no transaction is active', async () => {
    await rejects(
      () =>
        transact(
          async (conn) => {
            await conn.insert(widgets).values({ name: 'widget-1' });
            throw new Error('boom');
          },
          { propagation: Propagation.Supports },
        ),
      /boom/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'widget-1');
  });

  it('joins the active transaction when one is active', async () => {
    await transact(async (outer) => {
      await outer.insert(widgets).values({ name: 'widget-1' });

      await transact(
        async (conn) => {
          eq(conn, outer);
          const rows = await conn.select().from(widgets);
          eq(rows.length, 1);
          await conn.insert(widgets).values({ name: 'widget-2' });
        },
        { propagation: Propagation.Supports },
      );
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 2);
  });

  it('rolls back with the outer transaction when one is active', async () => {
    await rejects(
      () =>
        transact(async () => {
          await transact(
            async (conn) => {
              await conn.insert(widgets).values({ name: 'widget-1' });
            },
            { propagation: Propagation.Supports },
          );
          throw new Error('boom');
        }),
      /boom/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('joins an adopted transaction', async () => {
    await rejects(
      () =>
        getDb().transaction(async (tx) => {
          await adoptTransaction(tx, async () => {
            await transact(
              async (conn) => {
                eq(conn, tx);
                await conn.insert(widgets).values({ name: 'widget-1' });
              },
              { propagation: Propagation.Supports },
            );
          });
          throw new Error('boom');
        }),
      /boom/,
    );

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('joins an adopted database', async () => {
    await getDb().transaction(async (tx) => {
      await adoptDatabase(tx, async () => {
        await transact(
          async (conn) => {
            eq(conn, tx);
            await conn.insert(widgets).values({ name: 'widget-1' });
          },
          { propagation: Propagation.Supports },
        );
      });
    });

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
  });

  it('returns the value of fn', async () => {
    const result = await transact(async () => 42, { propagation: Propagation.Supports });
    eq(result, 42);
  });

  it('is exposed as supportsTransaction', async () => {
    const standalone = await supportsTransaction(async (conn) => {
      await conn.insert(widgets).values({ name: 'widget-1' });
      return 'standalone';
    });
    eq(standalone, 'standalone');

    await transact(async (outer) => {
      await supportsTransaction(async (conn) => {
        eq(conn, outer);
      });
    });
  });
});
