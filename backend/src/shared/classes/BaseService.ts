import {MongoDatabase} from '#shared/database/index.js';
import {
  ClientSession,
  ReadPreference,
  ReadConcern,
  WriteConcern,
} from 'mongodb';

export abstract class BaseService {
  constructor(private readonly db: MongoDatabase) {}

  protected async _withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const client = await this.db.getClient();
    const txOptions = {
      readPreference: ReadPreference.primary,
      readConcern: new ReadConcern('snapshot'),
      writeConcern: new WriteConcern('majority'),
    };

    const MAX_RETRIES = 3;
    let attempt = 0;

    // Write conflicts (and other transient transaction errors) happen when two
    // operations touch the same document concurrently — MongoDB aborts one. They're
    // safe to retry since the aborted transaction makes no durable changes.
    for (;;) {
      const session = client.startSession();
      try {
        session.startTransaction(txOptions);
        const result = await operation(session);
        await session.commitTransaction();
        return result;
      } catch (error: any) {
        if (session.inTransaction()) {
          await session.abortTransaction().catch(() => {});
        }

        const isTransient =
          error?.errorLabels?.includes?.('TransientTransactionError') ||
          error?.code === 112 || // WriteConflict
          error?.codeName === 'WriteConflict';

        if (isTransient && attempt < MAX_RETRIES) {
          attempt++;
          // Jittered backoff before retrying so concurrent writers don't collide again.
          await new Promise(res =>
            setTimeout(res, 50 * attempt + Math.floor(Math.random() * 50)),
          );
          continue;
        }
        throw error;
      } finally {
        await session.endSession();
      }
    }
  }
}
