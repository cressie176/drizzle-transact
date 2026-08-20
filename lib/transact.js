const { Propagation } = require('./types');
const { dispatch } = require('./dispatch');

function buildTransact(db, defaults) {
  return async function transact(fn, options) {
    const merged = { propagation: Propagation.Required, ...defaults, ...options };
    return dispatch(merged.propagation, db, fn, merged);
  };
}

module.exports = { buildTransact };
