const { Propagation } = require('./types');
const { dispatch } = require('./dispatch');

function buildTransact(db) {
  return async function transact(fn, options) {
    const merged = { propagation: Propagation.Required, ...options };
    return dispatch(merged.propagation, db, fn, merged);
  };
}

module.exports = { buildTransact };
