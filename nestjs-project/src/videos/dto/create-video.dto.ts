import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  /** Size in bytes; the 10 GiB ceiling is enforced by the service. */
  @IsInt()
  @Min(1)
  fileSize: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contentType: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;
}
