function runTransactional(transact, options) {
  return function decorate(target, propertyKey, descriptor) {
    const original = descriptor.value;
    return {
      ...descriptor,
      value: function (...args) {
        return transact(() => original.apply(this, args), options);
      },
    };
  };
}

module.exports = { runTransactional };
