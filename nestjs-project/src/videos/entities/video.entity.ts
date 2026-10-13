import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { Category } from '../../categories/entities/category.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { VideoStatus } from '../video-status.enum';
import { VideoVisibility } from '../video-visibility.enum';

// PostgreSQL returns bigint/numeric as strings; sizes stay far below 2^53.
const numberTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('videos')
@Index('IDX_videos_public_id', ['public_id'], { unique: true })
@Index('IDX_videos_channel_id', ['channel_id'])
@Index('IDX_videos_status', ['status'])
@Index('IDX_videos_category_id', ['category_id'])
@Index('IDX_videos_channel_published', ['channel_id', 'published_at', 'id'])
export class Video {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_videos' })
  id: string;

  @Column({ type: 'varchar', length: 11 })
  public_id: string;

  @Column({ type: 'uuid' })
  channel_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.DRAFT,
  })
  status: VideoStatus;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 100 })
  content_type: string;

  @Column({ type: 'bigint', transformer: numberTransformer })
  declared_size: number;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: numberTransformer,
  })
  size_bytes: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  upload_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  storage_key: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  thumbnail_key: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: numberTransformer,
  })
  duration_seconds: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  error_reason: string | null;

  @Column({ type: 'integer', default: 0 })
  processing_attempts: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({
    type: 'enum',
    enum: VideoVisibility,
    default: VideoVisibility.PUBLIC,
  })
  visibility: VideoVisibility;

  @Column({ type: 'timestamp', nullable: true })
  published_at: Date | null;

  @Column({ type: 'integer', default: 0 })
  view_count: number;

  @Column({ type: 'integer', default: 0 })
  like_count: number;

  @Column({ type: 'integer', default: 0 })
  dislike_count: number;

  @Column({ type: 'integer', default: 0 })
  comment_count: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Channel, (channel) => channel.videos)
  @JoinColumn({
    name: 'channel_id',
    foreignKeyConstraintName: 'FK_videos_channel_id',
  })
  channel: Channel;

  @ManyToOne(() => Category, (category) => category.videos, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'FK_videos_category_id',
  })
  category: Category | null;
}
