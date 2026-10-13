import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateChannelDto {
  /** Lowercase letters, digits and underscore, up to 50 characters. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{1,50}$/, {
    message: 'nickname must contain only lowercase letters, digits and _',
  })
  nickname?: string;

  /** 1–50 characters after trimming. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  /** Up to 1000 characters; `null` or an empty string clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
