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

const db = drizzle({ client: pool });

export const { transact, newTransaction, ensureTransaction, withTransaction, nestTransaction, withoutTransaction, supportsTransaction } = createTransact(db);
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
| accessMode     | AccessMode     | driver default       | Sets the transaction access mode                  |

#### Syntactic Sugar

Six shorthand functions are provided as alternatives to `transact(fn, { propagation: ... })`:

| Function                         | Equivalent propagation       |
|----------------------------------|------------------------------|
| newTransaction(fn, options?)     | Propagation.RequiresNew      |
| ensureTransaction(fn, options?)  | Propagation.Required         |
| withTransaction(fn)              | Propagation.RequiresExisting |
| nestTransaction(fn, options?)    | Propagation.Nested           |
| withoutTransaction(fn)           | Propagation.Never            |
| supportsTransaction(fn)          | Propagation.Supports         |

### adoptTransaction(tx, fn)

Makes an externally established transaction the active transaction for the duration of `fn`, preserving full transactional semantics. See [Adopting External Transactions](#adopting-external-transactions).

### adoptDatabase(db, fn)

Makes an externally supplied database handle the active transaction for the duration of `fn`, and routes `newTransaction` and `nestTransaction` through it as well. See [Adopting External Transactions](#adopting-external-transactions).

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
| Propagation.Supports         | Run without a transaction | Join existing                                        |
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

### Propagation.Supports

Joins the active transaction if there is one, and otherwise runs the callback directly against the database without starting one. Use it for reads that should see a surrounding transaction's uncommitted changes when called within one, but should not pay for a transaction when called standalone.

```ts
async function findWidget(id: number) {
  return transact(async (conn) => {
    return conn.select().from(widgets).where(eq(widgets.id, id));
  }, { propagation: Propagation.Supports });
}

// standalone — a single round trip
await findWidget(1);              // SELECT

// within a transaction — joins it, sees uncommitted changes
await transact(async () => {
  await saveWidget({ name: 'Widget' });
  await findWidget(1);
});
```

Under `Propagation.Required` the standalone call would issue `BEGIN`, `SELECT` and `COMMIT` — three round trips to wrap a statement that is already atomic on its own. `Propagation.Supports` issues only the `SELECT`.

The trade-off is that the callback has no atomicity or isolation of its own when no transaction is active. A write under `Propagation.Supports` is not an error, but it commits immediately and cannot be rolled back by anything, so reserve it for reads.

Note that `drizzle-transact` cannot distinguish "no transaction is active" from "a transaction is active but was never adopted". If a transaction was opened outside the library and not passed to [`adoptTransaction`](#adopting-external-transactions), `Propagation.Supports` runs on a separate connection and silently misses that transaction's uncommitted changes. `Propagation.Required` has the same blind spot in that situation, and can additionally deadlock when writes contend. Adopt external transactions and neither arises.

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

## Access Modes

```ts
import { AccessMode } from 'drizzle-transact';
```

The `accessMode` option is passed to the underlying Drizzle transaction. Like `isolationLevel`, it is only applied when a new transaction is started, and is silently ignored when joining an existing one.

```ts
const report = await transact(async (tx) => {
  return tx.select().from(accounts);
}, { accessMode: AccessMode.ReadOnly });
```

| Value     | SQL equivalent |
|-----------|----------------|
| ReadOnly  | READ ONLY      |
| ReadWrite | READ WRITE     |

`AccessMode.ReadOnly` turns an intention into a guarantee: any write inside the transaction is rejected by the database rather than silently committed, so a callback that is only supposed to read cannot be quietly extended into one that writes. `AccessMode.ReadWrite` matches the usual database default, so its purpose is to state the requirement explicitly where the default has been changed, for example a session or role configured read-only.

Not all databases support access modes. Refer to your Drizzle driver documentation.

## Adopting External Transactions

drizzle-transact only sees transactions it starts itself. If a transaction was opened elsewhere — directly through `db.transaction`, or by a tool that supplies its own database handle — functions using `transact` or the sugar functions will not join it. Worse, `Propagation.Required` starts a separate transaction on a different connection, which can deadlock against the outer one.

`adoptTransaction` makes an externally supplied handle the active transaction for the duration of a callback:

```ts
import { adoptTransaction } from 'drizzle-transact';

await db.transaction(async (tx) => {
  await adoptTransaction(tx, async () => {
    await createOrder(); // Propagation.Required joins tx
  });
});
```

Within an adopted transaction, full transactional semantics are preserved: `Propagation.RequiresNew` still opens an independent transaction on the database the bundle is bound to, and `Propagation.Nested` still creates a savepoint on the adopted transaction.

Those semantics are wrong for tools that inject their own database and provide isolation themselves. For example, [drizzle-explain](https://github.com/cressie176/drizzle-explain) runs a callback against an instrumented database built on `drizzle-orm/pg-proxy` — a driver that cannot open transactions at all — inside a sandbox transaction it always rolls back. Under `adoptTransaction`, `Propagation.Nested` would throw, and `Propagation.RequiresNew` would escape the sandbox — running unmeasured statements on the real database and committing them permanently. `adoptDatabase` exists for exactly this case: it makes the supplied handle the active transaction *and* routes `Propagation.RequiresNew` and `Propagation.Nested` through it, without attempting to open transactions on it:

```ts
import { adoptDatabase } from 'drizzle-transact';

const analysis = await explain((edb) => adoptDatabase(edb, () => findReservationsByRoom(roomId)));
```

Every statement issued by your persistence functions — including those inside `newTransaction` and `nestTransaction` blocks — runs against `edb`, is captured for analysis, and is rolled back with the sandbox.

Choose by who owns isolation: `adoptDatabase` is for scopes where the environment already provides it (a test sandbox, a tool like drizzle-explain), so transaction-opening propagations run flat against the adopted handle and no statement escapes the scope. If you need real transactional semantics inside the scope — independent commits, savepoints — that is `adoptTransaction`. In particular, adopting a plain live database with `adoptDatabase` means `newTransaction` blocks run raw and unatomic; that is almost never what you want outside a sandbox.

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
