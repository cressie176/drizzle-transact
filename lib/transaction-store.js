const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function getStack() {
  return storage.getStore() ?? [];
}

function peek() {
  const stack = getStack();
  return stack[stack.length - 1];
}

function push(tx, fn) {
  const stack = getStack();
  return storage.run([...stack, tx], fn);
}

module.exports = { peek, push };
