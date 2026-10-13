import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { CategoriesResponseDto } from './dto/categories-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List video categories',
    description: 'Returns every category in display order.',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories in display order',
    type: CategoriesResponseDto,
  })
  findAll(): Promise<CategoriesResponseDto> {
    return this.categoriesService.findAll();
  }
}
