import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { normalizeKeysToLower } from '#root/utils/normalizeKeysToLower.js';
import { parseQuestionUploadFile } from '../controllers/helpers/fileUploadParser.js';
import { BadRequestError } from 'routing-controllers';

describe('normalizeKeysToLower', () => {
  it('trims whitespace and converts keys to lowercase', () => {
    const input = {
      '  Question  ': 'What is rust in wheat?',
      ' Crop ': 'Wheat',
      ' STATE ': 'Punjab',
    };
    const result = normalizeKeysToLower(input);
    expect(result.question).toBe('What is rust in wheat?');
    expect(result.crop).toBe('Wheat');
    expect(result.state).toBe('Punjab');
  });

  it('maps common aliases to canonical field names', () => {
    const input = {
      'Question Text': 'How to control aphids?',
      'crop_name': 'Cotton',
      'district name': 'Nagpur',
      'Initial Answer': 'Use neem oil spray.',
    };
    const result = normalizeKeysToLower(input);
    expect(result.question).toBe('How to control aphids?');
    expect(result.crop).toBe('Cotton');
    expect(result.district).toBe('Nagpur');
    expect(result.aiinitialanswer).toBe('Use neem oil spray.');
  });

  it('handles nested objects and arrays correctly', () => {
    const input = [
      {
        ' Query ': 'Sample query',
        ' Details ': {
          ' CROP ': 'Maize',
        },
      },
    ];
    const result = normalizeKeysToLower(input);
    expect(result[0].question).toBe('Sample query');
    expect(result[0].details.crop).toBe('Maize');
  });
});

describe('parseQuestionUploadFile', () => {
  it('parses valid JSON array buffer', () => {
    const jsonStr = JSON.stringify([
      { question: 'How to water paddy?', crop: 'Paddy' },
    ]);
    const file = {
      buffer: Buffer.from(jsonStr, 'utf-8'),
      mimetype: 'application/json',
      originalname: 'questions.json',
    } as Express.Multer.File;

    const result = parseQuestionUploadFile(file);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('How to water paddy?');
  });

  it('parses Excel buffer with header whitespace and alias', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { ' Question Text ': 'How to fertilize sugarcane?', ' Crop Name ': 'Sugarcane' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const file = {
      buffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'questions.xlsx',
    } as Express.Multer.File;

    const result = parseQuestionUploadFile(file);
    expect(result).toHaveLength(1);
    const normalized = normalizeKeysToLower(result[0]);
    expect(normalized.question).toBe('How to fertilize sugarcane?');
    expect(normalized.crop).toBe('Sugarcane');
  });

  it('parses CSV buffer correctly', () => {
    const csvContent = 'Question,Crop,State\nHow to control blight?,Potato,UP';
    const file = {
      buffer: Buffer.from(csvContent, 'utf-8'),
      mimetype: 'text/csv',
      originalname: 'data.csv',
    } as Express.Multer.File;

    const result = parseQuestionUploadFile(file);
    expect(result).toHaveLength(1);
    const normalized = normalizeKeysToLower(result[0]);
    expect(normalized.question).toBe('How to control blight?');
    expect(normalized.crop).toBe('Potato');
  });

  it('throws BadRequestError when file has no question column', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { 'RandomColumn': 'Some text', 'AnotherColumn': '123' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const file = {
      buffer,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      originalname: 'invalid.xlsx',
    } as Express.Multer.File;

    expect(() => parseQuestionUploadFile(file)).toThrow(BadRequestError);
  });

  it('throws BadRequestError when file is completely empty', () => {
    const file = {
      buffer: Buffer.from('[]', 'utf-8'),
      mimetype: 'application/json',
      originalname: 'empty.json',
    } as Express.Multer.File;

    expect(() => parseQuestionUploadFile(file)).toThrow(BadRequestError);
  });
});
