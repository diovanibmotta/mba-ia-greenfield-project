import { ApiProperty } from '@nestjs/swagger';

export class PublicChannelResponseDto {
  @ApiProperty({ example: 'meu_canal' })
  nickname!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ description: 'Published and public videos of the channel' })
  videoCount!: number;
}
