import { ApiProperty } from '@nestjs/swagger';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function buildPage<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
): Page<T> {
  return { items, page, pageSize, total };
}

/** Swagger-friendly base for paginated responses. */
export abstract class PageResponseDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty({ description: 'Total items after filtering' })
  total!: number;
}
