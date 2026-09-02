import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  it('validates a correct limit and page', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 100 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(100);
  });

  it('defaults page to 1 and limit to 20 when empty', async () => {
    const dto = plainToInstance(PaginationDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('rejects a limit > 100 (data exfiltration mitigation bound)', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.max).toBeDefined();
  });

  it('rejects a limit < 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: 1, limit: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.min).toBeDefined();
  });

  it('rejects a page < 1', async () => {
    const dto = plainToInstance(PaginationDto, { page: 0, limit: 100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints?.min).toBeDefined();
  });
});
