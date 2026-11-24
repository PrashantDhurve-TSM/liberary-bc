import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MemberLoansQueryDto {
  @IsOptional()
  @IsIn(['active', 'history'])
  status: 'active' | 'history' = 'active';
}

export class AdminLoansQueryDto {
  @IsOptional()
  @IsIn(['pending', 'issued', 'overdue', 'returned', 'lost', 'all'])
  status?: 'pending' | 'issued' | 'overdue' | 'returned' | 'lost' | 'all';

  @IsOptional()
  @IsString()
  member?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class IssueLoanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  memberId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  barcode: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class ReturnLoanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  barcode: string;

  @IsIn(['good', 'damaged', 'lost'])
  condition: 'good' | 'damaged' | 'lost';
}

export class AdminReservationsQueryDto {
  @IsOptional()
  @IsIn(['waiting', 'ready', 'fulfilled', 'cancelled', 'expired', 'all'])
  status?: 'waiting' | 'ready' | 'fulfilled' | 'cancelled' | 'expired' | 'all';

  @IsOptional()
  @IsString()
  book?: string;
}
