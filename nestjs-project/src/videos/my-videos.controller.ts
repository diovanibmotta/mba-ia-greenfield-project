import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ListMyVideosQueryDto } from './dto/list-my-videos-query.dto';
import { MyVideosPageDto } from './dto/my-video-item.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth()
@Controller('me/videos')
export class MyVideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @ApiOperation({
    summary: 'List the videos of the authenticated channel',
    description:
      'Management panel listing with offset pagination, sorting and publication state filter.',
  })
  @ApiResponse({ status: 200, type: MyVideosPageDto })
  @ApiResponse({
    status: 400,
    description: 'Query parameters outside the allowed values',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  listMyVideos(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMyVideosQueryDto,
  ): Promise<MyVideosPageDto> {
    return this.videosService.listMyVideos(user.sub, query);
  }
}
