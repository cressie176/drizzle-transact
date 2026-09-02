const { push, peekAdoptedDatabase } = require('./transaction-store');

function runRequiresNew(db, fn, options) {
  const database = peekAdoptedDatabase();
  if (database) return fn(database);
  return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
}

function toTransactionConfig({ isolationLevel } = {}) {
  return isolationLevel ? { isolationLevel } : undefined;
}

module.exports = { runRequiresNew };
