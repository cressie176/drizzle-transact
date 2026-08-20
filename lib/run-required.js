const { peek, push } = require('./transaction-store');

function runRequired(db, fn, options) {
  const activeTx = peek();
  if (activeTx) return fn(activeTx);
  return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
}

function toTransactionConfig({ isolationLevel } = {}) {
  return isolationLevel ? { isolationLevel } : undefined;
}

module.exports = { runRequired };
