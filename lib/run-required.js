const { peek, push } = require('./transaction-store');

function runRequired(db, fn, options) {
  const activeTx = peek();
  if (activeTx) return fn(activeTx);
  return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
}

function toTransactionConfig({ isolationLevel, accessMode } = {}) {
  if (!isolationLevel && !accessMode) return undefined;
  const config = {};
  if (isolationLevel) config.isolationLevel = isolationLevel;
  if (accessMode) config.accessMode = accessMode;
  return config;
}

module.exports = { runRequired };
