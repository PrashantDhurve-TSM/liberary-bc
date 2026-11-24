import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateLibrarySettingsDto } from './update-library-settings.dto.js';

describe('UpdateLibrarySettingsDto', () => {
  it('accepts a partial membership policy update', async () => {
    const input = plainToInstance(UpdateLibrarySettingsDto, {
      loanDays: { student: 21 },
    });

    await expect(validate(input)).resolves.toHaveLength(0);
  });

  it.each([
    { loanDays: { student: 0 } },
    { maxActiveLoans: { faculty: 101 } },
  ])('rejects invalid membership policy values', async (value) => {
    const input = plainToInstance(UpdateLibrarySettingsDto, value);

    await expect(validate(input)).resolves.not.toHaveLength(0);
  });
});
