import { ApiProperty } from '@nestjs/swagger';

export class ThumbnailResponseDto {
  @ApiProperty({ description: 'Signed URL of the new thumbnail' })
  thumbnailUrl!: string;
}
