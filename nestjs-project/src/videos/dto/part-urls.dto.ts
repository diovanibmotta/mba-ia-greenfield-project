import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';
import { MAX_PART_URLS_PER_REQUEST } from '../video.constants';

export class PartUrlsDto {
  /** Part numbers to sign; range checks against `totalParts` happen in the service. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PART_URLS_PER_REQUEST)
  @IsInt({ each: true })
  partNumbers: number[];
}
