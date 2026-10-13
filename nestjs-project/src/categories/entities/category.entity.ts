import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Video } from '../../videos/entities/video.entity';

@Entity('categories')
@Index('IDX_categories_slug', ['slug'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_categories' })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  slug: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'integer' })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Video, (video) => video.category)
  videos: Video[];
}
