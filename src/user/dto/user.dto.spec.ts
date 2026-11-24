import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterMemberDto } from './user.dto.js';

describe('RegisterMemberDto', () => {
  it('accepts member signup fields under whitelist validation', async () => {
    const dto = plainToInstance(RegisterMemberDto, {
      name: 'Prashant',
      email: 'prashantxu@gmail.com',
      phone: '9876543210',
      password: 'long-enough-password',
      membershipType: 'student',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });

  it('does not allow clients to assign account roles or tokens', async () => {
    const dto = plainToInstance(RegisterMemberDto, {
      name: 'Prashant',
      email: 'prashantxu@gmail.com',
      phone: '9876543210',
      password: 'long-enough-password',
      role: 'admin',
      refreshToken: 'client-controlled-token',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['role', 'refreshToken']),
    );
  });
});
