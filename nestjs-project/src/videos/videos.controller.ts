import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { CreateVideoResponseDto } from './dto/create-video-response.dto';
import { PartUrlsDto } from './dto/part-urls.dto';
import { PartUrlsResponseDto } from './dto/part-urls-response.dto';
import { PlaybackUrlResponseDto } from './dto/playback-url-response.dto';
import { PublishVideoDto } from './dto/publish-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadedPartsResponseDto } from './dto/uploaded-parts-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a video upload',
    description:
      'Creates the video draft and opens a multipart upload in object storage.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft created',
    type: CreateVideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed, file too large or unsupported media type',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoDto,
  ): Promise<CreateVideoResponseDto> {
    return this.videosService.createDraft(user.sub, dto);
  }

  @Post(':publicId/upload/part-urls')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get presigned URLs for upload parts',
    description:
      'Issues presigned UploadPart URLs so the client sends parts straight to object storage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned URLs issued',
    type: PartUrlsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or part number out of range',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not in a state that accepts uploads',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getPartUrls(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: PartUrlsDto,
  ): Promise<PartUrlsResponseDto> {
    return this.videosService.getPartUrls(user.sub, publicId, dto.partNumbers);
  }

  @Get(':publicId/upload/parts')
  @ApiOperation({
    summary: 'List uploaded parts',
    description:
      'Lists the parts already stored for the open multipart upload so an interrupted upload can resume.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parts already stored',
    type: UploadedPartsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not in a state that accepts uploads',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  listUploadedParts(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<UploadedPartsResponseDto> {
    return this.videosService.listUploadedParts(user.sub, publicId);
  }

  @Post(':publicId/upload/complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Complete the upload',
    description:
      'Finalizes the multipart upload, validates the stored size and queues the video for processing.',
  })
  @ApiResponse({
    status: 202,
    description: 'Upload completed; processing queued',
    type: CompleteUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed, parts mismatch, size mismatch or file too large',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not in a state that accepts uploads',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponseDto> {
    return this.videosService.completeUpload(user.sub, publicId, dto);
  }

  @Delete(':publicId/upload')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel the upload',
    description:
      'Aborts the open multipart upload and discards the video draft.',
  })
  @ApiResponse({ status: 204, description: 'Upload cancelled' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is no longer a draft',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  cancelUpload(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
  ): Promise<void> {
    return this.videosService.cancelUpload(user.sub, publicId);
  }

  @OptionalAuth()
  @Get(':publicId')
  @ApiOperation({
    summary: 'Get a video',
    description:
      'Videos in `pronto` are public. Any other status is visible only to the owner (send the access token).',
  })
  @ApiResponse({
    status: 200,
    description: 'Video found',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found, or not visible to the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getVideo(
    @Param('publicId') publicId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<VideoResponseDto> {
    return this.videosService.getVideo(publicId, user?.sub);
  }

  @OptionalAuth()
  @Get(':publicId/stream')
  @ApiOperation({
    summary: 'Get the streaming URL',
    description:
      'Returns a short-lived signed URL; the player streams straight from object storage with Range support.',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed streaming URL',
    type: PlaybackUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found, or not visible to the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'The owner asked for a video that is not ready yet',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getStreamUrl(
    @Param('publicId') publicId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<PlaybackUrlResponseDto> {
    return this.videosService.getPlaybackUrl(publicId, user?.sub, {
      download: false,
    });
  }

  @OptionalAuth()
  @Get(':publicId/download')
  @ApiOperation({
    summary: 'Get the download URL',
    description:
      'Returns a short-lived signed URL that makes the browser save the file under its original name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed download URL',
    type: PlaybackUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found, or not visible to the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'The owner asked for a video that is not ready yet',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getDownloadUrl(
    @Param('publicId') publicId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<PlaybackUrlResponseDto> {
    return this.videosService.getPlaybackUrl(publicId, user?.sub, {
      download: true,
    });
  }

  @Patch(':publicId')
  @ApiOperation({
    summary: 'Edit a video',
    description:
      'Updates title, description, category and visibility. Only the informed fields change.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video updated',
    type: VideoResponseDto,
  })
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
    description: 'Video or category not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video upload is still in progress',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  updateVideo(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    return this.videosService.updateVideo(user.sub, publicId, dto);
  }

  @Post(':publicId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a video',
    description:
      'Publishes a ready video that has a category, optionally setting its visibility.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video published',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or the video has no category',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the caller',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready or is already published',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  publishVideo(
    @CurrentUser() user: JwtPayload,
    @Param('publicId') publicId: string,
    @Body() dto: PublishVideoDto,
  ): Promise<VideoResponseDto> {
    return this.videosService.publishVideo(user.sub, publicId, dto);
  }
}
