import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReportRangeQueryDto {
  @IsOptional()
  @IsIn(['week', 'month'])
  range: 'week' | 'month' = 'week';
}

export class MostBorrowedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class FineReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReportExportQueryDto {
  @IsIn(['circulation'])
  type: 'circulation';

  @IsIn(['csv'])
  format: 'csv';

  @IsOptional()
  @IsIn(['week', 'month'])
  range: 'week' | 'month' = 'week';
}

export class AuditLogsQueryDto {
  @IsOptional()
  @IsMongoId()
  actor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  resource?: string;

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
