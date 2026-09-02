const { push } = require('./transaction-store');

function adoptTransaction(tx, fn) {
  return push(tx, () => fn(tx));
}

module.exports = { adoptTransaction };
