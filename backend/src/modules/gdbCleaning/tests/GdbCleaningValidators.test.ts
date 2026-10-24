import 'reflect-metadata';
import {describe, it, expect} from 'vitest';
import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {
  GdbDecisionDto,
  GetGdbCleaningListQuery,
} from '../classes/validators/GdbCleaningValidators.js';

const check = async (plain: object) => {
  const query = plainToInstance(GetGdbCleaningListQuery, plain);
  return {query, errors: await validate(query)};
};

describe('GetGdbCleaningListQuery', () => {
  it('turns a single filter value into a list', async () => {
    const {query, errors} = await check({states: 'Punjab', statuses: 'todo'});
    expect(errors).toHaveLength(0);
    expect(query.states).toEqual(['Punjab']);
    expect(query.statuses).toEqual(['todo']);
  });

  it('keeps a repeated filter as it is', async () => {
    const {query, errors} = await check({statuses: ['todo', 'pending']});
    expect(errors).toHaveLength(0);
    expect(query.statuses).toEqual(['todo', 'pending']);
  });

  it('does not split a value on commas, so a crop name can contain one', async () => {
    const {query} = await check({crops: 'Fruits, vegetables'});
    expect(query.crops).toEqual(['Fruits, vegetables']);
  });

  it('refuses an unknown status, a page of 0 and a limit over 100', async () => {
    expect((await check({statuses: ['bogus']})).errors).not.toHaveLength(0);
    expect((await check({page: '0'})).errors).not.toHaveLength(0);
    expect((await check({limit: '101'})).errors).not.toHaveLength(0);
  });

  it('accepts a normal page request', async () => {
    const {query, errors} = await check({page: '2', limit: '25'});
    expect(errors).toHaveLength(0);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(25);
  });
});

describe('GdbDecisionDto', () => {
  it('only allows accept or dismiss', async () => {
    const good = plainToInstance(GdbDecisionDto, {action: 'accept'});
    const bad = plainToInstance(GdbDecisionDto, {action: 'delete'});
    expect(await validate(good)).toHaveLength(0);
    expect(await validate(bad)).not.toHaveLength(0);
  });
});
