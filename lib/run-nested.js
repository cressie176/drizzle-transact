const { peek, push } = require('./transaction-store');

function runNested(db, fn, options) {
  const activeTx = peek();
  if (!activeTx) return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
  return activeTx.transaction((tx) => push(tx, () => fn(tx)));
}

function toTransactionConfig({ isolationLevel } = {}) {
  return isolationLevel ? { isolationLevel } : undefined;
}

module.exports = { runNested };
