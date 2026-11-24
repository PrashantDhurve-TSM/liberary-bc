import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { BookCopyStatus } from '../entities/book-copy.entity.js';

export class BookListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsIn(['available', 'all'])
  availability?: 'available' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsIn(['title', '-createdAt', '-rating.avg', '-borrowCount'])
  sort?: 'title' | '-createdAt' | '-rating.avg' | '-borrowCount';

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

export class AdminBookListQueryDto extends BookListQueryDto {
  @IsOptional()
  @IsIn(['active', 'archived', 'all'])
  status?: 'active' | 'archived' | 'all';
}

export class CreateBookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  authors: string[];

  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{10}|\d{13})$/)
  isbn?: string;

  @IsMongoId()
  category: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  totalCopies: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  publishedYear?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pages?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  coverUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  shelfLocation?: string;
}

export class UpdateBookDto extends PartialType(
  OmitType(CreateBookDto, ['totalCopies'] as const),
) {}

export class AddCopiesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  count: number;
}

export class UpdateCopyStatusDto {
  @IsIn([
    BookCopyStatus.AVAILABLE,
    BookCopyStatus.DAMAGED,
    BookCopyStatus.LOST,
    BookCopyStatus.WITHDRAWN,
  ])
  status: BookCopyStatus;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
