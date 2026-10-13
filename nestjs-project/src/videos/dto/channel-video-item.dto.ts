import { ApiProperty } from '@nestjs/swagger';

export class ChannelVideoItemDto {
  @ApiProperty({ description: 'Public id of the video' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  durationSeconds!: number | null;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;

  @ApiProperty()
  viewCount!: number;
}

export class ChannelVideosPageDto {
  @ApiProperty({ type: [ChannelVideoItemDto] })
  items!: ChannelVideoItemDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
