import 'reflect-metadata';
import {describe, it, expect, vi} from 'vitest';
import {UserRepository} from '#root/shared/database/providers/mongo/repositories/UserRepository.js';
import type {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';

// Builds the repository over a fake database and returns the users collection's findOne spy.
function repositoryWithSpy() {
  const findOne = vi.fn(async () => null);
  const db = {getCollection: vi.fn(async () => ({findOne}))} as unknown as MongoDatabase;
  return {repository: new UserRepository(db), findOne};
}

// Returns the email regex the repository sent to MongoDB on the given call.
const emailPattern = (findOne: ReturnType<typeof vi.fn>, call = 0): RegExp =>
  findOne.mock.calls[call][0].email;

describe('UserRepository.findByEmailIgnoreCase', () => {
  it('matches the whole address regardless of letter case', async () => {
    const {repository, findOne} = repositoryWithSpy();

    await repository.findByEmailIgnoreCase('Jane.Doe+tag@Test.com');
    const pattern = emailPattern(findOne);

    expect(pattern.flags).toContain('i');
    expect(pattern.test('jane.doe+tag@test.com')).toBe(true);
    expect(pattern.test('JANE.DOE+TAG@TEST.COM')).toBe(true);
    expect(pattern.test('x-jane.doe+tag@test.com')).toBe(false);
    expect(pattern.test('jane.doe+tag@test.com.evil')).toBe(false);
  });

  it('treats regex characters in the input literally', async () => {
    const {repository, findOne} = repositoryWithSpy();

    await repository.findByEmailIgnoreCase('jane.doe@test.com');
    await repository.findByEmailIgnoreCase('.*');

    expect(emailPattern(findOne, 0).test('janexdoe@test.com')).toBe(false);
    expect(emailPattern(findOne, 1).test('anyone@test.com')).toBe(false);
    expect(emailPattern(findOne, 1).test('.*')).toBe(true);
  });
});
