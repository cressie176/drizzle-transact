const { pushAdoptedDatabase } = require('./transaction-store');

function adoptDatabase(database, fn) {
  return pushAdoptedDatabase(database, () => fn(database));
}

module.exports = { adoptDatabase };
