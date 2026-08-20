const { peek } = require('./transaction-store');

function runRequiresExisting(db, fn) {
  const activeTx = peek();
  if (!activeTx) throw new Error('Propagation.RequiresExisting requires an active transaction, but none was found');
  return fn(activeTx);
}

module.exports = { runRequiresExisting };
