const { peek, push, peekAdoptedDatabase } = require('./transaction-store');

function runNested(db, fn, options) {
  const database = peekAdoptedDatabase();
  if (database) return fn(database);
  const activeTx = peek();
  if (!activeTx) return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
  return activeTx.transaction((tx) => push(tx, () => fn(tx)));
}

function toTransactionConfig({ isolationLevel, accessMode } = {}) {
  if (!isolationLevel && !accessMode) return undefined;
  const config = {};
  if (isolationLevel) config.isolationLevel = isolationLevel;
  if (accessMode) config.accessMode = accessMode;
  return config;
}

module.exports = { runNested };
