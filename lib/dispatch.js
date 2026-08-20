const { Propagation } = require('./types');
const { runRequired } = require('./run-required');
const { runRequiresNew } = require('./run-requires-new');
const { runNested } = require('./run-nested');
const { runRequiresExisting } = require('./run-requires-existing');
const { runNever } = require('./run-never');

const handlers = {
  [Propagation.Required]: runRequired,
  [Propagation.RequiresNew]: runRequiresNew,
  [Propagation.Nested]: runNested,
  [Propagation.RequiresExisting]: runRequiresExisting,
  [Propagation.Never]: runNever,
};

function dispatch(propagation, db, fn, options) {
  const handler = handlers[propagation];
  if (!handler) throw new Error(`Unknown propagation: ${propagation}`);
  return handler(db, fn, options);
}

module.exports = { dispatch };
