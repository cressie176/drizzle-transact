# drizzle-transact

[![NPM Version](https://img.shields.io/npm/v/drizzle-transact)](https://www.npmjs.com/package/drizzle-transact)
[![CI](https://github.com/cressie176/drizzle-transact/actions/workflows/qa.yml/badge.svg)](https://github.com/cressie176/drizzle-transact/actions/workflows/qa.yml)
[![Coverage](https://codecov.io/gh/cressie176/drizzle-transact/branch/main/graph/badge.svg)](https://codecov.io/gh/cressie176/drizzle-transact)
[![Node.js](https://img.shields.io/node/v/drizzle-transact)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/drizzle-transact)](LICENSE)

Transaction management for [Drizzle ORM](https://orm.drizzle.team/) with propagation semantics and implicit transaction passing via `AsyncLocalStorage`.

## The Problem

Drizzle requires you to pass a transaction object explicitly to every function that needs to participate in a transaction:

```ts
async function createOrder(tx: DbTransaction) {
  const [order] = await tx.insert(orders).values(...).returning();
  await createOrderItems(tx, order.id);
  return order;
}

async function createOrderItems(tx: DbTransaction, orderId: number) {
  await tx.insert(orderItems).values(...);
}

const order = await db.transaction(async (tx) => {
  return createOrder(tx);
});
```

This leaks transaction concerns throughout your call stack. `drizzle-transact` eliminates this by storing the active transaction in `AsyncLocalStorage`, making it implicitly available anywhere within the transactional context.

## The Solution

```ts
import { transact } from './db';

async function createOrder() {
  return transact(async (tx) => {
    const [order] = await tx.insert(orders).values(...).returning();
    await createOrderItems(order.id);
    return order;
  });
}

async function createOrderItems(orderId: number) {
  await transact(async (tx) => {
    await tx.insert(orderItems).values(...);
  });
}

const order = await transact(() => createOrder());
```

No transaction object is passed between functions. When `createOrderItems` calls `transact`, it receives the same transaction already started by the outer `transact` call. If the callback throws, the transaction is rolled back. Otherwise it commits.

## Installation

```sh
npm install drizzle-transact
```

`drizzle-transact` has zero production dependencies. It uses `AsyncLocalStorage` from the Node.js standard library and your existing Drizzle instance. Nothing extra to audit, nothing to break.

## Setup

Call `createTransact` with your Drizzle database instance and export what you need. Other modules import from this shared module.

```ts
// db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { createTransact } from 'drizzle-transact';

const db = drizzle(pool);

export const { transact, newTransaction, ensureTransaction, withTransaction, nestTransaction, Transactional } = createTransact(db);
```

```ts
// order-service.ts
import { ensureTransaction } from './db';

async function createOrder() {
  return ensureTransaction(async (tx) => {
    const [order] = await tx.insert(orders).values(...).returning();
    return order;
  });
}
```

## API

### createTransact(db)

Creates a transaction bundle bound to the given Drizzle database instance.

### transact(fn, options?)

Executes `fn` within a transaction according to the specified propagation semantics. The active transaction is passed to `fn` as its first argument. If `fn` throws, the transaction is rolled back. Otherwise it commits.

`transact` returns the value returned by `fn`:

```ts
const users = await transact((tx) => tx.select().from(users));

const [order] = await transact(async (tx) => {
  return tx.insert(orders).values(...).returning();
});
```

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `propagation` | `Propagation` | `Propagation.Required` | Controls how the transaction is started or reused |
| `isolationLevel` | `IsolationLevel` | driver default | Sets the transaction isolation level |

### Sugar functions

Four shorthand functions are provided as alternatives to `transact(fn, { propagation: ... })`:

| Function | Equivalent propagation | Commits / rolls back |
|---|---|---|
| `newTransaction(fn)` | `Propagation.RequiresNew` | Always — starts an independent transaction |
| `ensureTransaction(fn)` | `Propagation.Required` | Only if it started the transaction; joins silently otherwise |
| `withTransaction(fn)` | `Propagation.RequiresExisting` | Never — commit and rollback are the outer transaction's responsibility |
| `nestTransaction(fn)` | `Propagation.Nested` | Only its own savepoint if nested; full transaction if started fresh |

## Propagation

```ts
import { Propagation } from 'drizzle-transact';
```

Propagation controls what happens when `transact()` is called and a transaction may or may not already be active.

| Value | No active transaction | Active transaction exists |
|---|---|---|
| Propagation.Required | Start new transaction | Join existing |
| Propagation.RequiresNew | Start new transaction | Push new independent transaction onto internal stack |
| Propagation.Nested | Start new transaction | Create a savepoint within the existing transaction |
| Propagation.RequiresExisting | Throw | Join existing |
| Propagation.Never | Run without a transaction | Throw |

### Propagation.Required (default)

The most common propagation. Participates in any surrounding transaction, or starts one if there isn't one.

```ts
async function saveUser(user: User) {
  return transact(async (tx) => {
    const [saved] = await tx.insert(users).values(user).returning();
    return saved;
  });
}

// called standalone — starts a new transaction
const alice = await saveUser({ name: 'Alice' });

// called within an outer transaction — joins it
await transact(async () => {
  const alice = await saveUser({ name: 'Alice' });
  const bob = await saveUser({ name: 'Bob' });
});
```

### Propagation.RequiresNew

Always starts a new independent transaction. If an outer transaction is already active, the new transaction is pushed onto an internal stack and runs independently — committing or rolling back without affecting the outer transaction. When it completes, the outer transaction resumes as the active transaction.

Useful for operations that must succeed or fail on their own, such as audit logging.

```ts
async function auditLog(event: AuditEvent) {
  await transact(async (tx) => {
    await tx.insert(auditEvents).values(event);
  }, { propagation: Propagation.RequiresNew });
}

const order = await transact(async () => {
  const order = await createOrder();
  await auditLog({ action: 'order.created', orderId: order.id }); // commits independently
  return order;
});
```

### Propagation.Nested

Creates a savepoint within the existing transaction. If the nested block rolls back, only changes made within that block are undone — the outer transaction continues. If no transaction is active, a new one is started.

Note: savepoint support depends on your database driver. PostgreSQL and MySQL support savepoints; SQLite does not.

```ts
const order = await transact(async () => {
  const order = await createOrder();

  try {
    await transact(async (tx) => {
      await tx.insert(auditEvents).values({ action: 'order.created', orderId: order.id });
    }, { propagation: Propagation.Nested });
  } catch {
    // audit log failed, but the order is still saved
  }

  return order;
});
```

### Propagation.RequiresExisting

Joins the active transaction or throws. Use this to assert that a function is always called within an outer transaction.

```ts
async function deductStock(productId: number, qty: number) {
  await transact(async (tx) => {
    await tx.update(products)
      .set({ stock: sql`stock - ${qty}` })
      .where(eq(products.id, productId));
  }, { propagation: Propagation.RequiresExisting });
}

// throws — no active transaction
await deductStock(1, 5);

// fine — joins the outer transaction
await transact(async () => {
  const order = await createOrder();
  await deductStock(order.productId, order.qty);
});
```

### Propagation.Never

Throws if a transaction is active. If no transaction is active, the callback runs against the database directly without starting one.

```ts
async function readConfig() {
  return transact(async (db) => {
    return db.select().from(config);
  }, { propagation: Propagation.Never });
}
```

## Isolation Levels

```ts
import { IsolationLevel } from 'drizzle-transact';
```

The `isolationLevel` option is passed to the underlying Drizzle transaction. Supported values depend on your database driver.

```ts
const result = await transact(async (tx) => {
  return tx.select().from(accounts).where(eq(accounts.id, id));
}, { isolationLevel: IsolationLevel.Serializable });
```

| Value | SQL equivalent |
|---|---|
| IsolationLevel.ReadUncommitted | READ UNCOMMITTED |
| IsolationLevel.ReadCommitted | READ COMMITTED |
| IsolationLevel.RepeatableRead | REPEATABLE READ |
| IsolationLevel.Serializable | SERIALIZABLE |

Not all databases support all isolation levels. Refer to your Drizzle driver documentation.

## Error Handling

Any error thrown inside a `transact()` block causes the transaction to roll back. The original error is rethrown so the caller can handle it.

```ts
try {
  await transact(async () => {
    await createOrder();   // succeeds
    await deductStock();   // throws
    // transaction is rolled back, createOrder is undone
  });
} catch (err) {
  // err is the original error thrown by deductStock
}
```

## Experimental: Decorators

> **Experimental.** The decorator API may change between minor versions.

`@Transactional` is a method decorator that starts a transaction when the method is called. Inside the method, use `withTransaction` to access the active transaction.

Requires TypeScript 5.0+ with `experimentalDecorators` enabled in `tsconfig.json`, or the TC39 Stage 3 decorator proposal enabled for your toolchain.

```ts
import { Transactional, Propagation } from 'drizzle-transact';

class OrderService {
  @Transactional()
  async createOrder() {
    const [order] = await withTransaction((tx) => tx.insert(orders).values(...).returning());
    await this.auditLog({ action: 'order.created', orderId: order.id });
    return order;
  }

  @Transactional({ propagation: Propagation.RequiresNew })
  async auditLog(event: AuditEvent) {
    await withTransaction((tx) => tx.insert(auditEvents).values(event));
  }
}

const service = new OrderService();
await service.createOrder();
```

The same options accepted by `transact()` are accepted by `@Transactional()`.

## Supported Drivers

`drizzle-transact` is designed to work with all Drizzle ORM database drivers:

- `drizzle-orm/node-postgres`
- `drizzle-orm/postgres-js`
- `drizzle-orm/mysql2`
- `drizzle-orm/better-sqlite3`
- `drizzle-orm/libsql`

## Requirements

- Node.js 16+
- Drizzle ORM
