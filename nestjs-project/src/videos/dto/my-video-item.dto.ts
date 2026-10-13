import { ApiProperty } from '@nestjs/swagger';
import { PageResponseDto } from '../../common/pagination/page-response';
import { PublicationState } from '../publication-state.util';
import { VideoStatus } from '../video-status.enum';
import { VideoVisibility } from '../video-visibility.enum';

export class MyVideoItemDto {
  @ApiProperty({ description: 'Public id of the video' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  thumbnailUrl!: string | null;

  @ApiProperty({ enum: VideoStatus })
  status!: VideoStatus;

  @ApiProperty({ enum: PublicationState })
  publicationState!: PublicationState;

  @ApiProperty({ enum: VideoVisibility })
  visibility!: VideoVisibility;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  publishedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty()
  viewCount!: number;

  @ApiProperty()
  likeCount!: number;

  @ApiProperty()
  dislikeCount!: number;

  @ApiProperty()
  commentCount!: number;
}

export class MyVideosPageDto extends PageResponseDto {
  @ApiProperty({ type: [MyVideoItemDto] })
  items!: MyVideoItemDto[];
}
