import 'reflect-metadata';
import {vi} from 'vitest';
import {ObjectId} from 'mongodb';
import bcrypt from 'bcryptjs';
import {appConfig} from '#root/config/app.js';
import type {IUser} from '#root/shared/interfaces/models.js';
import type {IUserRepository} from '#root/shared/database/interfaces/IUserRepository.js';
import type {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import type {NotificationService} from '#root/modules/notification/services/NotificationService.js';

export const TEST_JWT_SECRET = 'test-only-local-auth-secret-0123456789-abcdef';
export const STRONG_PASSWORD = 'Str0ng!Passw0rd';

export type FakeNotificationService = NotificationService & {
  saveTheNotifications: ReturnType<typeof vi.fn>;
};

// Switches the shared app config to MongoDB email/password login for the current test file.
export function useLocalLoginConfig(): void {
  appConfig.enableFirebaseLogin = false;
  appConfig.localAuth.jwtSecret = TEST_JWT_SECRET;
  appConfig.localAuth.tokenTtlSeconds = 3600;
}

// Copies a record the way a database round trip would, so callers cannot mutate stored state.
function cloneRecord(user: IUser): IUser {
  return structuredClone({...user});
}

/**
 * In-memory stand-in for UserRepository covering the methods used by the auth flow.
 * Only the subset of IUserRepository the auth code calls is implemented.
 */
export class InMemoryUserRepository {
  readonly users = new Map<string, IUser>();

  // Inserts a user and returns its generated id, rejecting a duplicate firebaseUID like the real repository.
  async create(user: IUser): Promise<string> {
    const duplicate = [...this.users.values()].some(
      stored => stored.firebaseUID === user.firebaseUID,
    );
    if (duplicate) {
      throw new Error('User already exists');
    }
    const id = new ObjectId().toString();
    this.users.set(id, {...cloneRecord(user), _id: id});
    return id;
  }

  async findByEmail(email: string): Promise<IUser | null> {
    const user = [...this.users.values()].find(stored => stored.email === email);
    return user ? cloneRecord(user) : null;
  }

  async findByEmailIgnoreCase(email: string): Promise<IUser | null> {
    const user = [...this.users.values()].find(
      stored => stored.email?.toLowerCase() === email.toLowerCase(),
    );
    return user ? cloneRecord(user) : null;
  }

  async findByFirebaseUID(firebaseUID: string): Promise<IUser | null> {
    const user = [...this.users.values()].find(
      stored => stored.firebaseUID === firebaseUID,
    );
    return user ? cloneRecord(user) : null;
  }

  async findById(id: string): Promise<IUser | null> {
    const user = this.users.get(id);
    return user ? cloneRecord(user) : null;
  }

  // Applies a partial update like a Mongo $set and returns the updated record.
  async edit(id: string, data: Partial<IUser>): Promise<IUser | null> {
    const existing = this.users.get(id);
    if (!existing) {
      return null;
    }
    const {_id, ...changes} = data;
    const updated = {...existing, ...structuredClone(changes), updatedAt: new Date()};
    this.users.set(id, updated);
    return cloneRecord(updated);
  }

  async findAdmins(): Promise<IUser[]> {
    return [...this.users.values()]
      .filter(stored => stored.role === 'admin')
      .map(cloneRecord);
  }

  // Seeds a user directly, hashing the password like the service does (low cost to keep tests fast).
  async seedUser(
    overrides: Partial<IUser> & {email: string},
    plainPassword?: string,
  ): Promise<IUser> {
    const id = new ObjectId().toString();
    const user: IUser = {
      firebaseUID: `local_${id}`,
      firstName: 'Test',
      lastName: 'User',
      role: 'pae_expert',
      isVerified: true,
      isBlocked: false,
      status: 'active',
      ...overrides,
      _id: id,
      ...(plainPassword ? {password: await bcrypt.hash(plainPassword, 4)} : {}),
    };
    this.users.set(id, user);
    return cloneRecord(user);
  }

  // Returns the stored record including its password hash, for assertions only.
  getStoredByEmail(email: string): IUser | undefined {
    return [...this.users.values()].find(
      stored => stored.email?.toLowerCase() === email.toLowerCase(),
    );
  }

  asRepository(): IUserRepository {
    return this as unknown as IUserRepository;
  }
}

// Fake MongoDatabase whose client hands out no-op sessions, enough for BaseService transactions.
export function createFakeDatabase(): MongoDatabase {
  const session = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(async () => undefined),
    abortTransaction: vi.fn(async () => undefined),
    inTransaction: vi.fn(() => true),
    endSession: vi.fn(async () => undefined),
  };
  const client = {startSession: () => session};
  return {getClient: async () => client} as unknown as MongoDatabase;
}

// Notification service double that records the admin notifications sent on signup.
export function createFakeNotificationService(): FakeNotificationService {
  return {
    saveTheNotifications: vi.fn(async () => undefined),
  } as unknown as FakeNotificationService;
}
