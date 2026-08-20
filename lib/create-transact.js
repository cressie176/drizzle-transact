const { buildTransact } = require('./transact');
const { runTransactional } = require('./run-transactional');

function createTransact(db, defaults) {
  const transact = buildTransact(db, defaults);
  const Transactional = (options) => runTransactional(transact, options);
  return { transact, Transactional };
}

module.exports = { createTransact };
