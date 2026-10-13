import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page-query.dto';
import { PublicationState } from '../publication-state.util';

export enum MyVideosSort {
  CREATED_AT = 'createdAt',
  PUBLISHED_AT = 'publishedAt',
  TITLE = 'title',
  VIEW_COUNT = 'viewCount',
  LIKE_COUNT = 'likeCount',
  COMMENT_COUNT = 'commentCount',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListMyVideosQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: MyVideosSort, default: MyVideosSort.CREATED_AT })
  @IsOptional()
  @IsEnum(MyVideosSort)
  sort: MyVideosSort = MyVideosSort.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  order: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ enum: PublicationState })
  @IsOptional()
  @IsEnum(PublicationState)
  publicationState?: PublicationState;
}
