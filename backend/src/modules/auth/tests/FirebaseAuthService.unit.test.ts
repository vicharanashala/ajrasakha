import {describe, it, expect, beforeEach, vi} from 'vitest';

const mockAuth = {
  createUser: vi.fn(),
};

vi.mock('#root/config/firebaseAdmin.js', () => ({
  getFirebaseAuth: () => mockAuth,
}));

import {FirebaseAuthService} from '../services/FirebaseAuthService.js';

describe('FirebaseAuthService', () => {
  let service: FirebaseAuthService;

  let mockUserRepository: any;
  let mockNotificationService: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUserRepository = {
      create: vi.fn(),
      findAdmins: vi.fn(),
      findByFirebaseUID: vi.fn(),
    };

    mockNotificationService = {
      saveTheNotifications: vi.fn(),
    };

    service = new FirebaseAuthService(
      mockUserRepository,
      {} as any,
      mockNotificationService,
    );
  });

  it('creates firebase user successfully', async () => {
    mockAuth.createUser.mockResolvedValue({
      uid: 'firebase-uid',
      email: 'john@test.com',
      displayName: 'John Doe',
    });

    vi.spyOn(service, 'sendVerificationEmail').mockResolvedValue();

    const result = await service.signup({
      email: 'john@test.com',
      password: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
    });

    expect(mockAuth.createUser).toHaveBeenCalledWith({
      email: 'john@test.com',
      password: 'StrongPassword123!',
      displayName: 'John Doe',
      emailVerified: false,
      disabled: false,
    });

    expect(result.user.uid).toBe('firebase-uid');
  });
});
