import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { ChannelsService } from './channels.service';
import { PublicChannelResponseDto } from './dto/public-channel-response.dto';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get(':nickname')
  @Public()
  @ApiOperation({ summary: 'Public channel page' })
  @ApiResponse({ status: 200, type: PublicChannelResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Channel not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getChannel(
    @Param('nickname') nickname: string,
  ): Promise<PublicChannelResponseDto> {
    return this.channelsService.getPublicChannel(nickname);
  }
}
