const { peek } = require('./transaction-store');

function runSupports(db, fn) {
  const activeTx = peek();
  if (activeTx) return fn(activeTx);
  return fn(db);
}

module.exports = { runSupports };
