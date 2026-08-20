# Contributing

We're delighted to accept pull requests, but would also like to keep the drizzle-transact codebase consistent with the following principles and conventions. Feel free to ignore them (especially if you're fixing a bug), but don't be offended if your code gets re-written before it's merged.

### Doing One Thing (Well)

`drizzle-transact` does one thing: manage Drizzle ORM transactions without requiring them to be passed between functions. It is not a query builder, a connection manager, or an ORM. It should integrate with Drizzle easily and stay out of the way.

### Feature Improvements

Before working on an improvement, consider creating an issue for it. It may be something a maintainer or another contributor has already given thought to and can help with.

### Zero Production Dependencies

`drizzle-transact` has zero production dependencies. It uses `AsyncLocalStorage` from the Node.js standard library and your existing Drizzle instance. We intend to keep it that way.

### Very Small Functions

The average function in this codebase should be only a few lines long. If you need to write a comment to explain what a block of code inside a function does, extract that block into its own named function instead.

### Else Considered Harmful

Guard conditions — an `if` near the top of a function that returns immediately or throws — are fine. But try very hard to avoid `else` or `switch`. They typically hide a fork in behaviour that is better handled with polymorphism or named functions.

### Booleans Make Bad Parameters

Passing booleans as parameters leads to `else` statements. `else` statements are bad. Use polymorphism instead.

### Avoid Inheritance

We prefer composition and closures to class inheritance hierarchies.

### Encapsulate, Encapsulate, Encapsulate

Keep your behaviour and data as private as possible. If something does not need to be exported, don't export it. If a function is only used within a module, keep it private to that module. Leaked primitives and exposed internals lead to tight coupling and brittle code.

### Naming

Names should reveal intent. Prefer longer, clearer names over abbreviations. A function named `runInNewTransaction` is preferable to `newTx` or `startTx`. Avoid generic names like `helper`, `utils`, or `common` — name things by what they specifically do.

### No Comment

The only valid reason for a comment is to explain why confusing code cannot be simplified — perhaps you're working around a bug in a third-party library or implementing a naturally complex algorithm. If you're using a comment to explain _what_ code does, take the time to simplify the code instead.

### Automated Tests

The codebase is well tested and will continue to be so. Tests run against a real PostgreSQL database — no mocks. Please include tests with your pull request. Run the suite with:

```
npm test
```

and check coverage with:

```
npm run coverage
```

### Formatting and Linting

Formatting and linting are handled by [Biome](https://biomejs.dev/). Before committing:

```
npm run format
npm run lint
```

A [lefthook](https://github.com/evilmartians/lefthook) pre-commit hook runs these automatically.
