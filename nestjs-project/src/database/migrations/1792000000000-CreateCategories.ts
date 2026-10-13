import { MigrationInterface, QueryRunner } from 'typeorm';

const SEED: [slug: string, name: string][] = [
  ['educacao', 'Educação'],
  ['entretenimento', 'Entretenimento'],
  ['esportes', 'Esportes'],
  ['jogos', 'Jogos'],
  ['musica', 'Música'],
  ['noticias', 'Notícias'],
  ['tecnologia', 'Tecnologia'],
  ['outros', 'Outros'],
];

export class CreateCategories1792000000000 implements MigrationInterface {
  name = 'CreateCategories1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(50) NOT NULL, "name" character varying(100) NOT NULL, "sort_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_categories" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_categories_slug" ON "categories" ("slug") `,
    );
    for (const [index, [slug, name]] of SEED.entries()) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug", "name", "sort_order") VALUES ($1, $2, $3)`,
        [slug, name, index + 1],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_categories_slug"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
