const { peek } = require('./transaction-store');

function runNever(db, fn) {
  const activeTx = peek();
  if (activeTx) throw new Error('Propagation.Never: an active transaction was found but none was expected');
  return fn(db);
}

module.exports = { runNever };
