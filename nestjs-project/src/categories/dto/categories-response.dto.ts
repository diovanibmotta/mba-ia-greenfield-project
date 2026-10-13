export class CategoryDto {
  id: string;
  slug: string;
  name: string;
}

export class CategoriesResponseDto {
  /** Categories in display order. */
  items: CategoryDto[];
}
