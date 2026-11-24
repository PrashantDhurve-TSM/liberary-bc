import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBookDto,
  UpdateCopyStatusDto,
} from './catalog.dto.js';

describe('catalog DTOs', () => {
  it('converts and accepts a valid book request', async () => {
    const dto = plainToInstance(CreateBookDto, {
      title: 'The Pragmatic Programmer',
      authors: ['David Thomas', 'Andrew Hunt'],
      isbn: '9780135957059',
      category: '665f00000000000000000001',
      totalCopies: '3',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.totalCopies).toBe(3);
  });

  it('does not allow copy status changes to bypass circulation', async () => {
    const dto = plainToInstance(UpdateCopyStatusDto, {
      status: 'issued',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
