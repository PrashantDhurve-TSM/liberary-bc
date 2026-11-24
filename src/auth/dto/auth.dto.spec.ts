import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './auth.dto.js';

describe('LoginDto', () => {
  it('accepts login fields under whitelist validation', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'member@example.com',
      password: 'secret',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });

  it('does not accept a client-supplied role', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'member@example.com',
      password: 'secret',
      role: 'admin',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map(({ property }) => property)).toContain('role');
  });
});
