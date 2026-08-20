export enum Propagation {
  Required = 'Required',
  RequiresNew = 'RequiresNew',
  Nested = 'Nested',
  RequiresExisting = 'RequiresExisting',
  Never = 'Never',
}

export enum IsolationLevel {
  ReadUncommitted = 'read uncommitted',
  ReadCommitted = 'read committed',
  RepeatableRead = 'repeatable read',
  Serializable = 'serializable',
}

export interface TransactOptions {
  propagation?: Propagation;
  isolationLevel?: IsolationLevel;
}

export type TransactFn<TDb> = <TResult>(
  fn: (db: TDb) => Promise<TResult>,
  options?: TransactOptions,
) => Promise<TResult>;

export type SugarFn<TDb> = <TResult>(fn: (tx: TDb) => Promise<TResult>) => Promise<TResult>;

export interface IsolationOptions {
  isolationLevel?: IsolationLevel;
}

export interface TransactBundle<TDb> {
  transact: TransactFn<TDb>;
  Transactional: (options?: TransactOptions) => MethodDecorator;
  newTransaction: <TResult>(fn: (tx: TDb) => Promise<TResult>, options?: IsolationOptions) => Promise<TResult>;
  ensureTransaction: <TResult>(fn: (tx: TDb) => Promise<TResult>, options?: IsolationOptions) => Promise<TResult>;
  withTransaction: SugarFn<TDb>;
  nestTransaction: <TResult>(fn: (tx: TDb) => Promise<TResult>, options?: IsolationOptions) => Promise<TResult>;
}

export function createTransact<TDb>(db: TDb): TransactBundle<TDb>;
