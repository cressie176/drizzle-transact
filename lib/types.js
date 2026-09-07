const Propagation = Object.freeze({
  Required: 'Required',
  RequiresNew: 'RequiresNew',
  Nested: 'Nested',
  RequiresExisting: 'RequiresExisting',
  Supports: 'Supports',
  Never: 'Never',
});

const IsolationLevel = Object.freeze({
  ReadUncommitted: 'read uncommitted',
  ReadCommitted: 'read committed',
  RepeatableRead: 'repeatable read',
  Serializable: 'serializable',
});

module.exports = { Propagation, IsolationLevel };
