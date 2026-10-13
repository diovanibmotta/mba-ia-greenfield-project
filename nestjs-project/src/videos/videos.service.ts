import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { buildPage, Page } from '../common/pagination/page-response';
import { isPgUniqueViolationOnColumn } from '../common/database/pg-errors.util';
import {
  CategoryNotFoundException,
  CategoryRequiredException,
  ChannelNotFoundException,
  FileTooLargeException,
  InvalidThumbnailException,
  InvalidPartListException,
  InvalidPartNumberException,
  InvalidUploadStateException,
  UnsupportedMediaTypeException,
  UploadSizeMismatchException,
  VideoNotFoundException,
  VideoAlreadyPublishedException,
  VideoNotReadyException,
  VideoUploadInProgressException,
} from '../common/exceptions/domain.exception';
import queueConfig from '../config/queue.config';
import videoConfig from '../config/video.config';
import {
  VIDEO_PROCESS_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../queue/queue.constants';
import type { VideoProcessJobData } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { CompleteUploadResponseDto } from './dto/complete-upload-response.dto';
import { CreateVideoDto } from './dto/create-video.dto';
import { CreateVideoResponseDto } from './dto/create-video-response.dto';
import { PartUrlsResponseDto } from './dto/part-urls-response.dto';
import { PlaybackUrlResponseDto } from './dto/playback-url-response.dto';
import { PublishVideoDto } from './dto/publish-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadedPartsResponseDto } from './dto/uploaded-parts-response.dto';
import {
  ChannelVideoItemDto,
  ChannelVideosPageDto,
} from './dto/channel-video-item.dto';
import { ListChannelVideosQueryDto } from './dto/list-channel-videos-query.dto';
import {
  ListMyVideosQueryDto,
  MyVideosSort,
} from './dto/list-my-videos-query.dto';
import { MyVideoItemDto } from './dto/my-video-item.dto';
import { ThumbnailResponseDto } from './dto/thumbnail-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { Video } from './entities/video.entity';
import {
  derivePublicationState,
  isPublished,
  PublicationState,
} from './publication-state.util';
import { generatePublicId } from './public-id.util';
import { ThumbnailImageService } from './thumbnail-image.service';
import { ALLOWED_VIDEO_CONTENT_TYPES } from './video.constants';
import { VideoStatus } from './video-status.enum';
import { VideoVisibility } from './video-visibility.enum';

const PUBLIC_ID_COLUMN = 'public_id';

const MY_VIDEOS_SORT_COLUMNS: Record<MyVideosSort, string> = {
  [MyVideosSort.CREATED_AT]: 'video.created_at',
  [MyVideosSort.PUBLISHED_AT]: 'video.published_at',
  [MyVideosSort.TITLE]: 'video.title',
  [MyVideosSort.VIEW_COUNT]: 'video.view_count',
  [MyVideosSort.LIKE_COUNT]: 'video.like_count',
  [MyVideosSort.COMMENT_COUNT]: 'video.comment_count',
};
const MAX_PUBLIC_ID_ATTEMPTS = 5;

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly storage: StorageService,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly queue: Queue<VideoProcessJobData>,
    @Inject(queueConfig.KEY)
    private readonly queueSettings: ConfigType<typeof queueConfig>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly thumbnails: ThumbnailImageService,
  ) {}

  async createDraft(
    userId: string,
    dto: CreateVideoDto,
  ): Promise<CreateVideoResponseDto> {
    if (dto.fileSize > this.config.maxSizeBytes) {
      throw new FileTooLargeException();
    }
    if (!(dto.contentType in ALLOWED_VIDEO_CONTENT_TYPES)) {
      throw new UnsupportedMediaTypeException();
    }

    const channel = await this.channels.findOneByOrFail({ user_id: userId });

    const id = randomUUID();
    const storageKey = `videos/${id}/original.${resolveExtension(dto)}`;
    const draft = await this.saveDraft({
      id,
      channel_id: channel.id,
      title: dto.title ?? stripExtension(dto.fileName),
      file_name: dto.fileName,
      content_type: dto.contentType,
      declared_size: dto.fileSize,
      storage_key: storageKey,
    });

    try {
      const uploadId = await this.storage.createMultipartUpload(
        storageKey,
        dto.contentType,
      );
      await this.videos.update({ id }, { upload_id: uploadId });
    } catch (error) {
      await this.videos.delete({ id });
      throw error;
    }

    return {
      id: draft.public_id,
      title: draft.title,
      status: VideoStatus.DRAFT,
      partSize: this.config.partSizeBytes,
      totalParts: Math.ceil(dto.fileSize / this.config.partSizeBytes),
    };
  }

  /** Resolves a video of the caller's channel; anything else is "not found". */
  async findOwnedVideo(userId: string, publicId: string): Promise<Video> {
    const channel = await this.channels.findOneBy({ user_id: userId });
    if (!channel) throw new VideoNotFoundException();
    const video = await this.videos.findOneBy({
      public_id: publicId,
      channel_id: channel.id,
    });
    if (!video) throw new VideoNotFoundException();
    return video;
  }

  async getPartUrls(
    userId: string,
    publicId: string,
    partNumbers: number[],
  ): Promise<PartUrlsResponseDto> {
    const video = await this.findOwnedVideo(userId, publicId);
    const uploadId = this.requireOpenUpload(video);
    const totalParts = Math.ceil(
      video.declared_size / this.config.partSizeBytes,
    );
    if (partNumbers.some((n) => n < 1 || n > totalParts)) {
      throw new InvalidPartNumberException();
    }

    const urls = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignUploadPart(
          video.storage_key,
          uploadId,
          partNumber,
        ),
      })),
    );
    return { urls, expiresIn: this.storage.presignExpiresSeconds };
  }

  async listUploadedParts(
    userId: string,
    publicId: string,
  ): Promise<UploadedPartsResponseDto> {
    const video = await this.findOwnedVideo(userId, publicId);
    const uploadId = this.requireOpenUpload(video);
    const parts = await this.storage.listParts(video.storage_key, uploadId);
    return { parts };
  }

  async completeUpload(
    userId: string,
    publicId: string,
    dto: CompleteUploadDto,
  ): Promise<CompleteUploadResponseDto> {
    const video = await this.findOwnedVideo(userId, publicId);
    const uploadId = this.requireOpenUpload(video);

    const stored = await this.storage.listParts(video.storage_key, uploadId);
    if (!sameParts(dto.parts, stored)) {
      throw new InvalidPartListException();
    }

    const totalSize = stored.reduce((sum, part) => sum + part.size, 0);
    if (totalSize > this.config.maxSizeBytes) {
      await this.discardUpload(video, uploadId);
      throw new FileTooLargeException();
    }
    if (totalSize !== video.declared_size) {
      await this.discardUpload(video, uploadId);
      throw new UploadSizeMismatchException();
    }

    await this.storage.completeMultipartUpload(
      video.storage_key,
      uploadId,
      dto.parts,
    );
    await this.videos.update(
      { id: video.id },
      {
        status: VideoStatus.PROCESSING,
        size_bytes: totalSize,
        upload_id: null,
      },
    );
    await this.enqueueProcessing(video.id);

    return { id: video.public_id, status: VideoStatus.PROCESSING };
  }

  private async discardUpload(video: Video, uploadId: string): Promise<void> {
    await this.storage.abortMultipartUpload(video.storage_key, uploadId);
    await this.videos.update({ id: video.id }, { upload_id: null });
  }

  /** The row is already `processando`, so a failed enqueue must not strand it. */
  private async enqueueProcessing(videoId: string): Promise<void> {
    try {
      await this.queue.add(
        VIDEO_PROCESS_JOB,
        { videoId },
        {
          attempts: this.queueSettings.videoProcessingAttempts,
          backoff: {
            type: 'exponential',
            delay: this.queueSettings.videoProcessingBackoffMs,
          },
        },
      );
    } catch (error) {
      await this.videos.update(
        { id: videoId },
        {
          status: VideoStatus.ERROR,
          error_reason: 'PROCESSING_FAILED',
        },
      );
      throw error;
    }
  }

  async cancelUpload(userId: string, publicId: string): Promise<void> {
    const video = await this.findOwnedVideo(userId, publicId);
    if (video.status !== VideoStatus.DRAFT) {
      throw new InvalidUploadStateException();
    }
    if (video.upload_id) {
      await this.storage.abortMultipartUpload(
        video.storage_key,
        video.upload_id,
      );
    }
    await this.videos.delete({ id: video.id });
  }

  async getVideo(publicId: string, userId?: string): Promise<VideoResponseDto> {
    const { video, isOwner } = await this.findVisibleVideo(publicId, userId);
    return this.toResponse(video, isOwner);
  }

  /** Maps a video row to the API response; `errorReason` is only shown to the owner. */
  private async toResponse(
    video: Video,
    isOwner: boolean,
  ): Promise<VideoResponseDto> {
    return {
      id: video.public_id,
      title: video.title,
      description: video.description,
      status: video.status,
      publicationState: derivePublicationState(video),
      visibility: video.visibility,
      publishedAt: video.published_at ? video.published_at.toISOString() : null,
      category: video.category
        ? {
            id: video.category.id,
            slug: video.category.slug,
            name: video.category.name,
          }
        : null,
      durationSeconds: video.duration_seconds,
      thumbnailUrl: video.thumbnail_key
        ? await this.storage.presignGetObject(video.thumbnail_key)
        : null,
      errorReason:
        isOwner && video.status === VideoStatus.ERROR
          ? video.error_reason
          : null,
      viewCount: video.view_count,
      likeCount: video.like_count,
      dislikeCount: video.dislike_count,
      commentCount: video.comment_count,
      createdAt: video.created_at.toISOString(),
    };
  }

  /** Signed URL for streaming (inline) or, with `download`, for saving the file. */
  async getPlaybackUrl(
    publicId: string,
    userId: string | undefined,
    options: { download: boolean },
  ): Promise<PlaybackUrlResponseDto> {
    const { video } = await this.findVisibleVideo(publicId, userId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    const url = await this.storage.presignGetObject(
      video.storage_key,
      options.download ? { downloadFileName: video.file_name } : {},
    );
    return { url, expiresIn: this.storage.presignExpiresSeconds };
  }

  /** A published video is reachable by link (public or unlisted); anything else only by the owning channel. */
  private async findVisibleVideo(
    publicId: string,
    userId?: string,
  ): Promise<{ video: Video; isOwner: boolean }> {
    const video = await this.videos.findOne({
      where: { public_id: publicId },
      relations: { category: true },
    });
    if (!video) throw new VideoNotFoundException();

    const isOwner = userId
      ? (await this.channels.findOneBy({
          id: video.channel_id,
          user_id: userId,
        })) !== null
      : false;
    if (!isPublished(video) && !isOwner) {
      throw new VideoNotFoundException();
    }
    return { video, isOwner };
  }

  async updateVideo(
    userId: string,
    publicId: string,
    dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be informed');
    }
    const video = await this.findOwnedVideo(userId, publicId);
    this.assertEditable(video);

    if (
      dto.categoryId !== undefined &&
      !(await this.categories.existsBy({ id: dto.categoryId }))
    ) {
      throw new CategoryNotFoundException();
    }

    const changes: Pick<
      Partial<Video>,
      'title' | 'description' | 'category_id' | 'visibility'
    > = {};
    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.description !== undefined) {
      changes.description = dto.description === '' ? null : dto.description;
    }
    if (dto.categoryId !== undefined) changes.category_id = dto.categoryId;
    if (dto.visibility !== undefined) changes.visibility = dto.visibility;
    await this.videos.update({ id: video.id }, changes);

    const updated = await this.videos.findOneOrFail({
      where: { id: video.id },
      relations: { category: true },
    });
    return this.toResponse(updated, true);
  }

  async publishVideo(
    userId: string,
    publicId: string,
    dto: PublishVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.findOwnedVideo(userId, publicId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    if (video.published_at) {
      throw new VideoAlreadyPublishedException();
    }
    if (!video.category_id) {
      throw new CategoryRequiredException();
    }

    await this.videos.update(
      { id: video.id },
      {
        published_at: new Date(),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      },
    );

    const published = await this.videos.findOneOrFail({
      where: { id: video.id },
      relations: { category: true },
    });
    return this.toResponse(published, true);
  }

  async replaceThumbnail(
    userId: string,
    publicId: string,
    file: { buffer: Buffer } | undefined,
  ): Promise<ThumbnailResponseDto> {
    const video = await this.findOwnedVideo(userId, publicId);
    this.assertEditable(video);
    if (!file?.buffer?.length) {
      throw new InvalidThumbnailException();
    }

    const image = await this.thumbnails.normalize(file.buffer);
    const key = `videos/${video.id}/thumbnail-custom.jpg`;
    await this.storage.putObject(key, image, 'image/jpeg');
    await this.videos.update({ id: video.id }, { thumbnail_key: key });

    return { thumbnailUrl: await this.storage.presignGetObject(key) };
  }

  async listMyVideos(
    userId: string,
    query: ListMyVideosQueryDto,
  ): Promise<Page<MyVideoItemDto>> {
    const channel = await this.channels.findOneBy({ user_id: userId });
    if (!channel) throw new ChannelNotFoundException();

    const qb = this.videos
      .createQueryBuilder('video')
      .where('video.channel_id = :channelId', { channelId: channel.id });
    if (query.publicationState) {
      this.applyPublicationState(qb, query.publicationState);
    }

    const [videos, total] = await qb
      .orderBy(
        MY_VIDEOS_SORT_COLUMNS[query.sort],
        query.order === 'asc' ? 'ASC' : 'DESC',
        'NULLS LAST',
      )
      .addOrderBy('video.id', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    const items = await Promise.all(
      videos.map(async (video) => ({
        id: video.public_id,
        title: video.title,
        thumbnailUrl: video.thumbnail_key
          ? await this.storage.presignGetObject(video.thumbnail_key)
          : null,
        status: video.status,
        publicationState: derivePublicationState(video),
        visibility: video.visibility,
        publishedAt: video.published_at
          ? video.published_at.toISOString()
          : null,
        createdAt: video.created_at.toISOString(),
        viewCount: video.view_count,
        likeCount: video.like_count,
        dislikeCount: video.dislike_count,
        commentCount: video.comment_count,
      })),
    );
    return buildPage(items, query.page, query.pageSize, total);
  }

  async listChannelVideos(
    nickname: string,
    query: ListChannelVideosQueryDto,
  ): Promise<ChannelVideosPageDto> {
    const channel = await this.channels.findOneBy({ nickname });
    if (!channel) throw new ChannelNotFoundException();
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const publishedAtMs = "date_trunc('milliseconds', video.published_at)";
    const qb = this.videos
      .createQueryBuilder('video')
      .where('video.channel_id = :channelId', { channelId: channel.id })
      .andWhere('video.status = :status', { status: VideoStatus.READY })
      .andWhere('video.published_at IS NOT NULL')
      .andWhere('video.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      });
    if (cursor) {
      qb.andWhere(`(${publishedAtMs}, video.id) < (:publishedAt, :cursorId)`, {
        publishedAt: cursor.publishedAt,
        cursorId: cursor.id,
      });
    }

    const rows = await qb
      .orderBy(publishedAtMs, 'DESC')
      .addOrderBy('video.id', 'DESC')
      .limit(query.limit + 1)
      .getMany();

    const hasMore = rows.length > query.limit;
    const videos = hasMore ? rows.slice(0, query.limit) : rows;
    const last = videos[videos.length - 1];

    const items: ChannelVideoItemDto[] = await Promise.all(
      videos.map(async (video) => ({
        id: video.public_id,
        title: video.title,
        thumbnailUrl: video.thumbnail_key
          ? await this.storage.presignGetObject(video.thumbnail_key)
          : null,
        durationSeconds: video.duration_seconds,
        publishedAt: video.published_at!.toISOString(),
        viewCount: video.view_count,
      })),
    );
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ publishedAt: last.published_at!, id: last.id })
          : null,
    };
  }

  private applyPublicationState(
    qb: SelectQueryBuilder<Video>,
    state: PublicationState,
  ): void {
    switch (state) {
      case PublicationState.UPLOADING:
        qb.andWhere('video.status = :status', { status: VideoStatus.DRAFT });
        break;
      case PublicationState.PROCESSING:
        qb.andWhere('video.status = :status', {
          status: VideoStatus.PROCESSING,
        });
        break;
      case PublicationState.ERROR:
        qb.andWhere('video.status = :status', { status: VideoStatus.ERROR });
        break;
      case PublicationState.UNPUBLISHED:
        qb.andWhere('video.status = :status', { status: VideoStatus.READY });
        qb.andWhere('video.published_at IS NULL');
        break;
      case PublicationState.PUBLISHED:
        qb.andWhere('video.status = :status', { status: VideoStatus.READY });
        qb.andWhere('video.published_at IS NOT NULL');
        break;
    }
  }

  /** Metadata cannot change while the upload is still open. */
  private assertEditable(video: Video): void {
    if (video.status === VideoStatus.DRAFT && video.upload_id) {
      throw new VideoUploadInProgressException();
    }
  }

  /** Upload operations are only valid on a draft that still has an open multipart. */
  private requireOpenUpload(video: Video): string {
    if (video.status !== VideoStatus.DRAFT || !video.upload_id) {
      throw new InvalidUploadStateException();
    }
    return video.upload_id;
  }

  private async saveDraft(fields: Partial<Video>): Promise<Video> {
    for (let attempt = 1; attempt <= MAX_PUBLIC_ID_ATTEMPTS; attempt++) {
      try {
        return await this.videos.save(
          this.videos.create({ ...fields, public_id: generatePublicId() }),
        );
      } catch (error) {
        const collision = isPgUniqueViolationOnColumn(error, PUBLIC_ID_COLUMN);
        if (!collision || attempt === MAX_PUBLIC_ID_ATTEMPTS) throw error;
      }
    }
    throw new Error('Unreachable: public_id attempts exhausted');
  }
}

function stripExtension(fileName: string): string {
  const stripped = fileName.replace(/\.[^./\\]+$/, '').trim();
  return stripped.length > 0 ? stripped : fileName;
}

function resolveExtension(dto: CreateVideoDto): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(dto.fileName);
  return match
    ? match[1].toLowerCase()
    : ALLOWED_VIDEO_CONTENT_TYPES[dto.contentType];
}

const stripQuotes = (eTag: string): string => eTag.replace(/^"|"$/g, '');

function sameParts(
  submitted: { partNumber: number; eTag: string }[],
  stored: { partNumber: number; eTag: string }[],
): boolean {
  if (submitted.length !== stored.length) return false;
  const uniqueNumbers = new Set(submitted.map((part) => part.partNumber));
  if (uniqueNumbers.size !== submitted.length) return false;
  const storedByNumber = new Map(
    stored.map((part) => [part.partNumber, stripQuotes(part.eTag)]),
  );
  return submitted.every(
    (part) => storedByNumber.get(part.partNumber) === stripQuotes(part.eTag),
  );
}
