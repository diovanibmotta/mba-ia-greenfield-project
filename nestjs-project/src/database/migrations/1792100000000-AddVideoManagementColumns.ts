import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoManagementColumns1792100000000 implements MigrationInterface {
  name = 'AddVideoManagementColumns1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."videos_visibility_enum" AS ENUM('public', 'unlisted')`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD "description" text, ADD "category_id" uuid, ADD "visibility" "public"."videos_visibility_enum" NOT NULL DEFAULT 'public', ADD "published_at" TIMESTAMP, ADD "view_count" integer NOT NULL DEFAULT '0', ADD "like_count" integer NOT NULL DEFAULT '0', ADD "dislike_count" integer NOT NULL DEFAULT '0', ADD "comment_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_category_id" ON "videos" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_channel_published" ON "videos" ("channel_id", "published_at", "id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // Videos that were already ready were public in Phase 03: keep them public.
    await queryRunner.query(
      `UPDATE "videos" SET "published_at" = "updated_at" WHERE "status" = 'pronto'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_category_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_videos_channel_published"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_videos_category_id"`);
    await queryRunner.query(
      `ALTER TABLE "videos" DROP COLUMN "comment_count", DROP COLUMN "dislike_count", DROP COLUMN "like_count", DROP COLUMN "view_count", DROP COLUMN "published_at", DROP COLUMN "visibility", DROP COLUMN "category_id", DROP COLUMN "description"`,
    );
    await queryRunner.query(`DROP TYPE "public"."videos_visibility_enum"`);
  }
}
