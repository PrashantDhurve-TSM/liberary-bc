import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDemoPaymentDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsMongoId({ each: true })
  fineIds: string[];
}

export class AdminFinesQueryDto {
  @IsOptional()
  @IsIn(['unpaid', 'partial', 'paid', 'waived', 'all'])
  status?: 'unpaid' | 'partial' | 'paid' | 'waived' | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(64)
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

export class AdminPaymentsQueryDto {
  @IsOptional()
  @IsIn(['paid', 'all'])
  status?: 'paid' | 'all';

  @IsOptional()
  @IsString()
  @MaxLength(64)
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

export class CreateManualFineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  memberId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsIn(['damaged', 'lost', 'manual'])
  reason: 'damaged' | 'lost' | 'manual';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;
}

export class WaiveFineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class PayFineDto {
  @IsIn(['cash'])
  method: 'cash';
}
