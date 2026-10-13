import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriesResponseDto } from './dto/categories-response.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async findAll(): Promise<CategoriesResponseDto> {
    const rows = await this.categories.find({ order: { sort_order: 'ASC' } });
    return {
      items: rows.map(({ id, slug, name }) => ({ id, slug, name })),
    };
  }
}
