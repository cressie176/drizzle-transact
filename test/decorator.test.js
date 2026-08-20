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

function applyDecorator(Transactional, options, method) {
  const descriptor = { value: method };
  return Transactional(options)(null, 'method', descriptor).value;
}

describe('@Transactional', () => {
  let transact;
  let Transactional;
  let withTransaction;

  before(async () => {
    await connect();
    await createTables();
    ({ transact, Transactional, withTransaction } = createTransact(getDb()));
  });

  after(async () => {
    await dropTables();
    await close();
  });

  beforeEach(async () => {
    await truncateTables();
  });

  it('runs the decorated method within a transaction using the default propagation', async () => {
    const method = applyDecorator(Transactional, undefined, async () => {
      await withTransaction(async (tx) => {
        await tx.insert(widgets).values({ name: 'decorated' });
      });
    });

    await method();

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 1);
    eq(rows[0].name, 'decorated');
  });

  it('applies the specified propagation option', async () => {
    let outerTx;
    let innerTx;

    const inner = applyDecorator(Transactional, { propagation: Propagation.RequiresNew }, async () => {
      await withTransaction(async (tx) => {
        innerTx = tx;
      });
    });

    await transact(async (tx) => {
      outerTx = tx;
      await inner();
    });

    eq(outerTx !== innerTx, true);
  });

  it('returns the value of the decorated method', async () => {
    const method = applyDecorator(Transactional, undefined, async () => 42);
    const result = await method();
    eq(result, 42);
  });

  it('rolls back changes and rethrows when the decorated method throws', async () => {
    const method = applyDecorator(Transactional, undefined, async () => {
      await withTransaction(async (tx) => {
        await tx.insert(widgets).values({ name: 'doomed' });
      });
      throw new Error('boom');
    });

    await rejects(() => method(), /boom/);

    const rows = await getDb().select().from(widgets);
    eq(rows.length, 0);
  });

  it('preserves the this context of the decorated method', async () => {
    class Service {
      constructor(label) {
        this.label = label;
      }

      async run() {
        return this.label;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(Service.prototype, 'run');
    const wrapped = Transactional()(Service.prototype, 'run', descriptor);
    Service.prototype.run = wrapped.value;

    const service = new Service('ctx-test');
    const result = await service.run();
    eq(result, 'ctx-test');
  });

  it('multiple withTransaction calls within the decorated method share the same transaction', async () => {
    const seen = [];

    const method = applyDecorator(Transactional, undefined, async () => {
      await withTransaction(async (tx) => {
        seen.push(tx);
      });
      await withTransaction(async (tx) => {
        seen.push(tx);
      });
    });

    await method();

    eq(seen[0], seen[1]);
  });
});
