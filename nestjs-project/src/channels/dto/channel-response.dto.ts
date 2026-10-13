import { ApiProperty } from '@nestjs/swagger';

export class ChannelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'meu_canal' })
  nickname!: string;

  @ApiProperty({ example: 'Meu canal' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
