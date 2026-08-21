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
const order = await db.transaction(async (tx) => {
  return createOrder(tx);
});

async function createOrder(tx: DbTransaction) {
  const [order] = await tx.insert(orders).values(...).returning();
  await createOrderItems(tx, order.id);
  return order;
}

async function createOrderItems(tx: DbTransaction, orderId: number) {
  await tx.insert(orderItems).values(...);
}
```

This leaks transaction concerns throughout your call stack. `drizzle-transact` eliminates this by storing the active transaction in `AsyncLocalStorage`, making it implicitly available anywhere within the transactional context.

## The Solution

```ts
import { newTransaction, withTransaction } from './db';

const order = await newTransaction(() => createOrder());

async function createOrder() {
  return withTransaction(async (tx) => {
    const [order] = await tx.insert(orders).values(...).returning();
    await createOrderItems(order.id);
    return order;
  });
}

async function createOrderItems(orderId: number) {
  await withTransaction(async (tx) => {
    await tx.insert(orderItems).values(...);
  });
}
```

No transaction object is passed between functions. When `createOrderItems` calls `withTransaction`, it joins the transaction already started by the outer call. If the callback throws, the transaction is rolled back. Otherwise it commits.

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

export const { transact, newTransaction, ensureTransaction, withTransaction, nestTransaction, withoutTransaction } = createTransact(db);
```

```ts
// order-service.ts
import { newTransaction, withTransaction } from './db';

const order = await newTransaction(() => createOrder());

async function createOrder() {
  return withTransaction(async (tx) => {
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

| Option         | Type           | Default              | Description                                       |
|----------------|----------------|----------------------|---------------------------------------------------|
| propagation    | Propagation    | Propagation.Required | Controls how the transaction is started or reused |
| isolationLevel | IsolationLevel | driver default       | Sets the transaction isolation level              |

#### Syntactic Sugar

Five shorthand functions are provided as alternatives to `transact(fn, { propagation: ... })`:

| Function                        | Equivalent propagation       |
|---------------------------------|------------------------------|
| newTransaction(fn, options?)    | Propagation.RequiresNew      |
| ensureTransaction(fn, options?) | Propagation.Required         |
| withTransaction(fn)             | Propagation.RequiresExisting |
| nestTransaction(fn, options?)   | Propagation.Nested           |
| withoutTransaction(fn)          | Propagation.Never            |

## Propagation

```ts
import { Propagation } from 'drizzle-transact';
```

Propagation controls what happens when `transact()` is called and a transaction may or may not already be active.

| Value                        | No active transaction     | Active transaction exists                            |
|------------------------------|---------------------------|------------------------------------------------------|
| Propagation.Required         | Start new transaction     | Join existing                                        |
| Propagation.RequiresNew      | Start new transaction     | Push new independent transaction onto internal stack |
| Propagation.Nested           | Start new transaction     | Create a savepoint within the existing transaction   |
| Propagation.RequiresExisting | Throw                     | Join existing                                        |
| Propagation.Never            | Run without a transaction | Throw                                                |

### Propagation.Required (default)

The most common propagation. Participates in any surrounding transaction, or starts one if there isn't one.

```ts
// saveUser called standalone — starts a new transaction
const alice = await saveUser({ name: 'Alice' });

// saveUser called within an outer transaction — joins it
await transact(async () => {
  const alice = await saveUser({ name: 'Alice' });
  const bob = await saveUser({ name: 'Bob' });
}, { propagation: Propagation.Required });

async function saveUser(user: User) {
  return transact(async (tx) => {
    const [saved] = await tx.insert(users).values(user).returning();
    return saved;
  }, { propagation: Propagation.Required });
}
```

### Propagation.RequiresNew

Always starts a new independent transaction. If an outer transaction is already active, the new transaction is pushed onto an internal stack and runs independently — committing or rolling back without affecting the outer transaction. When it completes, the outer transaction resumes as the active transaction.

Useful for operations that must succeed or fail on their own, such as audit logging.

```ts
const order = await transact(async () => {
  const order = await createOrder();
  await auditLog({ action: 'order.created', orderId: order.id }); // commits independently
  return order;
});

async function auditLog(event: AuditEvent) {
  await transact(async (tx) => {
    await tx.insert(auditEvents).values(event);
  }, { propagation: Propagation.RequiresNew });
}
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
// throws — no active transaction
await deductStock(1, 5);

// fine — joins the outer transaction
await transact(async () => {
  const order = await createOrder();
  await deductStock(order.productId, order.qty);
});

async function deductStock(productId: number, qty: number) {
  await transact(async (tx) => {
    await tx.update(products)
      .set({ stock: sql`stock - ${qty}` })
      .where(eq(products.id, productId));
  }, { propagation: Propagation.RequiresExisting });
}
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

The `isolationLevel` option is passed to the underlying Drizzle transaction. It is only applied when a new transaction is started. If `isolationLevel` is specified but has no effect, it is silently ignored — no error is thrown.

```ts
const result = await transact(async (tx) => {
  return tx.select().from(accounts).where(eq(accounts.id, id));
}, { isolationLevel: IsolationLevel.Serializable });
```

| Value           | SQL equivalent   |
|-----------------|------------------|
| ReadUncommitted | READ UNCOMMITTED |
| ReadCommitted   | READ COMMITTED   |
| RepeatableRead  | REPEATABLE READ  |
| Serializable    | SERIALIZABLE     |

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

## Supported Drivers

`drizzle-transact` is designed to work with all Drizzle ORM database drivers

## Requirements

- Node.js 22+
- Drizzle ORM
