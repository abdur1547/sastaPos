import { Injectable, inject } from "@angular/core";
import {
  QueryResult,
  SqliteRecord,
  SqliteValue,
  Transaction,
} from "@powersync/common";
import { Observable } from "rxjs";

import { PowerSyncService } from "../powersync/powersync.service";

export interface DatabaseResult<Row extends SqliteRecord> {
  readonly rows: readonly Row[];
  readonly rowsAffected?: number;
  readonly insertId?: number;
}

export interface DatabaseExecutor {
  execute<Row extends SqliteRecord = SqliteRecord>(
    sql: string,
    parameters?: readonly SqliteValue[],
  ): Promise<DatabaseResult<Row>>;
  getAll<Row extends SqliteRecord>(
    sql: string,
    parameters?: readonly SqliteValue[],
  ): Promise<readonly Row[]>;
  getOptional<Row extends SqliteRecord>(
    sql: string,
    parameters?: readonly SqliteValue[],
  ): Promise<Row | null>;
  get<Row extends SqliteRecord>(
    sql: string,
    parameters?: readonly SqliteValue[],
  ): Promise<Row>;
}

interface SqlStatementExecutor {
  execute<Row extends SqliteRecord = SqliteRecord>(
    sql: string,
    parameters?: SqliteValue[],
  ): Promise<QueryResult<Row>>;
}

@Injectable({ providedIn: "root" })
export class DatabaseService {
  private readonly database = inject(PowerSyncService).db;

  execute<Row extends SqliteRecord = SqliteRecord>(
    sql: string,
    parameters: readonly SqliteValue[] = [],
  ): Promise<DatabaseResult<Row>> {
    return this.executeOn(this.database, sql, parameters);
  }

  getAll<Row extends SqliteRecord>(
    sql: string,
    parameters: readonly SqliteValue[] = [],
  ): Promise<readonly Row[]> {
    return this.database.getAll<Row>(sql, [...parameters]);
  }

  getOptional<Row extends SqliteRecord>(
    sql: string,
    parameters: readonly SqliteValue[] = [],
  ): Promise<Row | null> {
    return this.database.getOptional<Row>(sql, [...parameters]);
  }

  get<Row extends SqliteRecord>(
    sql: string,
    parameters: readonly SqliteValue[] = [],
  ): Promise<Row> {
    return this.database.get<Row>(sql, [...parameters]);
  }

  writeTransaction<Result>(
    operation: (transaction: DatabaseExecutor) => Promise<Result>,
  ): Promise<Result> {
    return this.database.writeTransaction((transaction) =>
      operation(this.wrap(transaction)),
    );
  }

  watch(
    sql: string,
    parameters: readonly SqliteValue[] = [],
  ): Observable<readonly SqliteRecord[]> {
    return new Observable((subscriber) => {
      const iterator = this.database
        .watch(sql, [...parameters])
        [Symbol.asyncIterator]();
      let cancelled = false;

      void (async () => {
        try {
          while (!cancelled) {
            const result = await iterator.next();
            if (result.done) {
              break;
            }
            subscriber.next(result.value.array);
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();

      return () => {
        cancelled = true;
        void iterator.return?.().catch((error: unknown) => {
          if (!subscriber.closed) {
            subscriber.error(error);
          }
        });
      };
    });
  }

  private wrap(transaction: Transaction): DatabaseExecutor {
    return {
      execute: <Row extends SqliteRecord = SqliteRecord>(
        sql: string,
        parameters: readonly SqliteValue[] = [],
      ) => this.executeOn(transaction, sql, parameters),
      getAll: <Row extends SqliteRecord>(
        sql: string,
        parameters: readonly SqliteValue[] = [],
      ) => transaction.getAll<Row>(sql, [...parameters]),
      getOptional: <Row extends SqliteRecord>(
        sql: string,
        parameters: readonly SqliteValue[] = [],
      ) => transaction.getOptional<Row>(sql, [...parameters]),
      get: <Row extends SqliteRecord>(
        sql: string,
        parameters: readonly SqliteValue[] = [],
      ) => transaction.get<Row>(sql, [...parameters]),
    };
  }

  private async executeOn<Row extends SqliteRecord>(
    executor: SqlStatementExecutor,
    sql: string,
    parameters: readonly SqliteValue[],
  ): Promise<DatabaseResult<Row>> {
    const result = await executor.execute<Row>(sql, [...parameters]);
    return {
      rows: result.array,
      rowsAffected: result.rowsAffected,
      insertId: result.insertId,
    };
  }
}
