const { buildTransact } = require('./transact');
const { Propagation } = require('./types');

function createTransact(db) {
  const transact = buildTransact(db);
  const newTransaction = (fn, options) => transact(fn, { ...options, propagation: Propagation.RequiresNew });
  const ensureTransaction = (fn, options) => transact(fn, { ...options, propagation: Propagation.Required });
  const withTransaction = (fn) => transact(fn, { propagation: Propagation.RequiresExisting });
  const nestTransaction = (fn, options) => transact(fn, { ...options, propagation: Propagation.Nested });
  const withoutTransaction = (fn) => transact(fn, { propagation: Propagation.Never });
  return { transact, newTransaction, ensureTransaction, withTransaction, nestTransaction, withoutTransaction };
}

module.exports = { createTransact };
