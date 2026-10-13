import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ChannelVideosPageDto } from './dto/channel-video-item.dto';
import { ListChannelVideosQueryDto } from './dto/list-channel-videos-query.dto';
import { VideosService } from './videos.service';

@ApiTags('channels')
@Controller('channels/:nickname/videos')
export class ChannelVideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List the public videos of a channel',
    description:
      'Cursor (keyset) pagination, newest first. Unlisted and unpublished videos are never returned.',
  })
  @ApiResponse({ status: 200, type: ChannelVideosPageDto })
  @ApiResponse({
    status: 400,
    description: 'Malformed cursor or limit out of range',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Channel not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  listChannelVideos(
    @Param('nickname') nickname: string,
    @Query() query: ListChannelVideosQueryDto,
  ): Promise<ChannelVideosPageDto> {
    return this.videosService.listChannelVideos(nickname, query);
  }
}
