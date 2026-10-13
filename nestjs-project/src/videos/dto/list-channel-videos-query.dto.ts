import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_CHANNEL_VIDEOS_LIMIT = 24;
export const MAX_CHANNEL_VIDEOS_LIMIT = 50;

export class ListChannelVideosQueryDto {
  @ApiPropertyOptional({ description: 'Opaque value from `nextCursor`' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_CHANNEL_VIDEOS_LIMIT,
    default: DEFAULT_CHANNEL_VIDEOS_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CHANNEL_VIDEOS_LIMIT)
  limit: number = DEFAULT_CHANNEL_VIDEOS_LIMIT;
}
