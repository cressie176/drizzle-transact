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

export interface TransactBundle<TDb> {
  transact: TransactFn<TDb>;
  Transactional: (options?: TransactOptions) => MethodDecorator;
  newTransaction: SugarFn<TDb>;
  ensureTransaction: SugarFn<TDb>;
  withTransaction: SugarFn<TDb>;
  nestTransaction: SugarFn<TDb>;
}

export function createTransact<TDb>(db: TDb): TransactBundle<TDb>;
