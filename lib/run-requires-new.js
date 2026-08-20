const { push } = require('./transaction-store');

function runRequiresNew(db, fn, options) {
  return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
}

function toTransactionConfig({ isolationLevel } = {}) {
  return isolationLevel ? { isolationLevel } : undefined;
}

module.exports = { runRequiresNew };
