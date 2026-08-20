const { buildTransact } = require('./transact');
const { runTransactional } = require('./run-transactional');
const { Propagation } = require('./types');

function createTransact(db) {
  const transact = buildTransact(db);
  const Transactional = (options) => runTransactional(transact, options);
  const newTransaction = (fn) => transact(fn, { propagation: Propagation.RequiresNew });
  const ensureTransaction = (fn) => transact(fn, { propagation: Propagation.Required });
  const withTransaction = (fn) => transact(fn, { propagation: Propagation.RequiresExisting });
  const nestTransaction = (fn) => transact(fn, { propagation: Propagation.Nested });
  return { transact, Transactional, newTransaction, ensureTransaction, withTransaction, nestTransaction };
}

module.exports = { createTransact };
