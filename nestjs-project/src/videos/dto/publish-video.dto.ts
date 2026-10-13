import { IsEnum, IsOptional } from 'class-validator';
import { VideoVisibility } from '../video-visibility.enum';

export class PublishVideoDto {
  /** When informed, replaces the current visibility before publishing. */
  @IsOptional()
  @IsEnum(VideoVisibility)
  visibility?: VideoVisibility;
}
