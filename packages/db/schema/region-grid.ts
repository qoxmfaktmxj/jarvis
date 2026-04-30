import {
  index,
  integer,
  numeric,
  pgTable,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

/**
 * region_grid — 기상청 단기예보 격자좌표(nx, ny) 매핑 테이블.
 *
 * 기상청은 한국 전역을 5km×5km 격자로 분할하고 각 격자에 (nx, ny)를 부여한다.
 * 사내 대시보드 날씨 카드는 이 테이블에서 사용자가 선택한 시·군·구의 격자좌표를
 * 조회해 KMA 단기예보 API 호출에 사용한다.
 *
 * Seed: .local/기상청41_*_격자_위경도(2510).xlsx (약 3,800 row).
 * 파싱 스크립트: scripts/import-grid-coords.mjs.
 */
export const regionGrid = pgTable(
  "region_grid",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sido: varchar("sido", { length: 50 }).notNull(),
    sigungu: varchar("sigungu", { length: 50 }).notNull(),
    dong: varchar("dong", { length: 100 }),
    nx: integer("nx").notNull(),
    ny: integer("ny").notNull(),
    lat: numeric("lat", { precision: 10, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 10, scale: 6 }).notNull()
  },
  (table) => ({
    sidoSigunguIdx: index("idx_region_grid_sido_sigungu").on(
      table.sido,
      table.sigungu
    ),
    nxNyIdx: index("idx_region_grid_nx_ny").on(table.nx, table.ny)
  })
);
