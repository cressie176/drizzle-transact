const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function getStack() {
  return storage.getStore() ?? [];
}

function peekEntry() {
  const stack = getStack();
  return stack[stack.length - 1];
}

function peek() {
  return peekEntry()?.handle;
}

function peekAdoptedDatabase() {
  const entry = peekEntry();
  if (!entry?.adoptedDatabase) return undefined;
  return entry.handle;
}

function push(tx, fn) {
  return runWithEntry({ handle: tx }, fn);
}

function pushAdoptedDatabase(database, fn) {
  return runWithEntry({ handle: database, adoptedDatabase: true }, fn);
}

function runWithEntry(entry, fn) {
  return storage.run([...getStack(), entry], fn);
}

module.exports = { peek, peekAdoptedDatabase, push, pushAdoptedDatabase };
