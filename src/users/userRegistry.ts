import { TableClient, type TableEntity } from "@azure/data-tables";

const USER_PARTITION = "users";
const DEFAULT_TABLE_NAME = "CecyUsers";
const MAX_WRITE_ATTEMPTS = 3;

export type UserStatus = "active" | "inactive";

export interface UserRecord {
  userId: string;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserUpsertResult {
  created: boolean;
  user: UserRecord;
}

export interface UserRegistry {
  upsertActive(userId: string, displayName: string): Promise<UserUpsertResult>;
  markInactive(userId: string): Promise<UserRecord | null>;
}

interface StoredUserEntity extends TableEntity {
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

type StoredUserResult = StoredUserEntity & { etag: string };

export interface UserTableClient {
  createTable(): Promise<void>;
  createEntity<T extends object>(entity: TableEntity<T>): Promise<unknown>;
  getEntity<T extends object>(partitionKey: string, rowKey: string): Promise<T & { etag: string }>;
  updateEntity<T extends object>(
    entity: TableEntity<T>,
    mode: "Merge" | "Replace",
    options: { etag: string },
  ): Promise<unknown>;
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}

function toUserRecord(entity: StoredUserEntity): UserRecord {
  return {
    userId: entity.rowKey,
    displayName: entity.displayName,
    status: entity.status,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class AzureTableUserRegistry implements UserRegistry {
  private readonly client: UserTableClient;
  private tableReady: Promise<void> | undefined;

  constructor(
    connectionString: string,
    tableName = DEFAULT_TABLE_NAME,
    client?: UserTableClient,
  ) {
    this.client = client ?? TableClient.fromConnectionString(connectionString, tableName);
  }

  async upsertActive(userId: string, displayName: string): Promise<UserUpsertResult> {
    await this.ensureTable();
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const existing = await this.getUser(userId);
      const now = new Date().toISOString();
      const entity: StoredUserEntity = {
        partitionKey: USER_PARTITION,
        rowKey: userId,
        displayName,
        status: "active",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      try {
        if (existing === null) {
          await this.client.createEntity(entity);
          return { created: true, user: toUserRecord(entity) };
        }
        await this.client.updateEntity(entity, "Replace", { etag: existing.etag });
        return { created: false, user: toUserRecord(entity) };
      } catch (error) {
        const isConflict = hasStatusCode(error, 409) || hasStatusCode(error, 412);
        if (!isConflict || attempt === MAX_WRITE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new Error("User write attempts exhausted");
  }

  async markInactive(userId: string): Promise<UserRecord | null> {
    await this.ensureTable();
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const existing = await this.getUser(userId);
      if (existing === null) {
        return null;
      }

      const updatedAt = new Date().toISOString();
      try {
        await this.client.updateEntity(
          {
            partitionKey: USER_PARTITION,
            rowKey: userId,
            status: "inactive",
            updatedAt,
          },
          "Merge",
          { etag: existing.etag },
        );
        return toUserRecord({ ...existing, status: "inactive", updatedAt });
      } catch (error) {
        if (!hasStatusCode(error, 412) || attempt === MAX_WRITE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new Error("User write attempts exhausted");
  }

  private async ensureTable(): Promise<void> {
    this.tableReady ??= this.client.createTable().catch((error: unknown) => {
      if (!hasStatusCode(error, 409)) {
        this.tableReady = undefined;
        throw error;
      }
    });
    await this.tableReady;
  }

  private async getUser(userId: string): Promise<StoredUserResult | null> {
    try {
      return await this.client.getEntity<StoredUserEntity>(USER_PARTITION, userId);
    } catch (error) {
      if (hasStatusCode(error, 404)) {
        return null;
      }
      throw error;
    }
  }
}

let registry: UserRegistry | undefined;

export function getUserRegistry(): UserRegistry {
  if (registry) {
    return registry;
  }

  const connectionString =
    process.env.USER_REGISTRY_STORAGE_CONNECTION ?? process.env.AzureWebJobsStorage;
  if (!connectionString) {
    throw new Error("User registry storage is not configured");
  }

  registry = new AzureTableUserRegistry(
    connectionString,
    process.env.USER_REGISTRY_TABLE_NAME ?? DEFAULT_TABLE_NAME,
  );
  return registry;
}