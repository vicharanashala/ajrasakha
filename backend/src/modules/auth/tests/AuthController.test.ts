import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {useExpressServer, useContainer} from 'routing-controllers';
import {Container} from 'inversify';
import {InversifyAdapter} from '#root/inversify-adapter.js';
import {faker} from '@faker-js/faker';
import {SignUpBody} from '#auth/classes/validators/AuthValidators.js';
import {authContainerModules} from '#auth/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {describe, it, expect, beforeAll, vi} from 'vitest';
import {HttpErrorHandler} from '#shared/index.js';
import {AuthController} from '../controllers/AuthController.js';

// Vitest sets NODE_ENV=test by default, which prevents dotenv from loading
// .env's NODE_ENV=development. Set it here (before any app/* imports that
// evaluate appConfig at module level) so isDevelopment=true, skipping the
// email-verification flow that requires SMTP credentials.
vi.hoisted(() => { process.env.NODE_ENV = 'development'; });

describe('Auth Controller Integration Tests', () => {
  const appInstance = Express();
  let app;

  beforeAll(async () => {
    const container = new Container();
    await container.load(...authContainerModules);

    const mockNotificationService = {
      saveTheNotifications: vi.fn().mockResolvedValue('notif-id'),
    };
    container.bind(GLOBAL_TYPES.NotificationService).toConstantValue(mockNotificationService);

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(appInstance, {
      controllers: [AuthController],
      validation: true,
      defaultErrorHandler: false,
      middlewares: [HttpErrorHandler],
    });
  }, 30000);

  describe('Sign Up Test', () => {
    it('should sign up a new user successfully', async () => {
      const signUpBody: SignUpBody = {
        email: faker.internet.email(),
        password: faker.internet.password(),
        firstName: faker.person.firstName('male').replace(/[^a-zA-Z]/g, ''),
        lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ''),
      };
      const response = await request(app)
        .post('/auth/signup/')
        .send(signUpBody);
      expect(response.status).toBe(201);
    }, 30000); // <-- timeout for this test

    it('should return 400 for invalid email', async () => {
      const signUpBody: SignUpBody = {
        email: 'invalid-email',
        password: faker.internet.password(),
        firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ''),
        lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ''),
      };
      const response = await request(app)
        .post('/auth/signup/')
        .send(signUpBody);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors[0].constraints.isEmail).toBeDefined();
      expect(response.body.errors[0].constraints.isEmail).toBe(
        'email must be an email',
      );
    }, 30000);

    it('should return 400 for missing required fields', async () => {
      const signUpBody: SignUpBody = {
        email: '',
        password: '',
        firstName: '',
        lastName: '',
      };
      const response = await request(app)
        .post('/auth/signup/')
        .send(signUpBody);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    }, 30000);

    it('should return 400 for weak password', async () => {
      const signUpBody: SignUpBody = {
        email: faker.internet.email(),
        password: '123',
        firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ''),
        lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ''),
      };
      const response = await request(app)
        .post('/auth/signup/')
        .send(signUpBody);
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    }, 30000);
  });
});
