import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
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
import { ChannelsService } from './channels.service';
import { ChannelResponseDto } from './dto/channel-response.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './entities/channel.entity';

function toResponse(channel: Channel): ChannelResponseDto {
  return {
    id: channel.id,
    nickname: channel.nickname,
    name: channel.name,
    description: channel.description,
    createdAt: channel.created_at.toISOString(),
  };
}

@ApiTags('channels')
@ApiBearerAuth()
@Controller('me/channel')
export class MyChannelController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user channel' })
  @ApiResponse({ status: 200, type: ChannelResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'The user has no channel',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getMyChannel(
    @CurrentUser() user: JwtPayload,
  ): Promise<ChannelResponseDto> {
    return toResponse(await this.channelsService.findByUserId(user.sub));
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Edit the authenticated user channel',
    description:
      'Updates nickname, name and/or description. An empty description clears it.',
  })
  @ApiResponse({ status: 200, type: ChannelResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or empty body',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'The user has no channel',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Nickname already in use',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async updateMyChannel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelResponseDto> {
    return toResponse(await this.channelsService.updateChannel(user.sub, dto));
  }
}
