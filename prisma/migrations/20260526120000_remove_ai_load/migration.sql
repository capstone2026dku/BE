-- DropTable
DROP TABLE IF EXISTS "load_logs";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_restaurants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_until" DATETIME,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL
);
INSERT INTO "new_restaurants" ("id", "name", "code", "is_locked", "locked_until", "open_time", "close_time")
SELECT "id", "name", "code", "is_locked", "locked_until", "open_time", "close_time" FROM "restaurants";
DROP TABLE "restaurants";
ALTER TABLE "new_restaurants" RENAME TO "restaurants";
CREATE UNIQUE INDEX "restaurants_code_key" ON "restaurants"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
