const { push, peekAdoptedDatabase } = require('./transaction-store');

function runRequiresNew(db, fn, options) {
  const database = peekAdoptedDatabase();
  if (database) return fn(database);
  return db.transaction((tx) => push(tx, () => fn(tx)), toTransactionConfig(options));
}

function toTransactionConfig({ isolationLevel, accessMode } = {}) {
  if (!isolationLevel && !accessMode) return undefined;
  const config = {};
  if (isolationLevel) config.isolationLevel = isolationLevel;
  if (accessMode) config.accessMode = accessMode;
  return config;
}

module.exports = { runRequiresNew };
