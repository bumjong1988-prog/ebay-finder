-- ============================================================
-- ebay-finder: 이베이 파인더(발굴) 전용 스키마
-- burgerwang Supabase 프로젝트에 추가
-- prefix: er_ (ebay-research)
-- ============================================================

-- 1) 발굴 키워드
CREATE TABLE IF NOT EXISTS er_keywords (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  category    TEXT,
  min_price   NUMERIC(10,2),
  max_price   NUMERIC(10,2),
  is_active   BOOLEAN DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_er_keywords_active ON er_keywords(user_id, is_active);

-- 2) Terapeak 집계 스냅샷 (키워드 단위)
CREATE TABLE IF NOT EXISTS er_terapeak_snapshots (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE,
  keyword_id          BIGINT REFERENCES er_keywords(id) ON DELETE CASCADE,
  collected_at        TIMESTAMPTZ DEFAULT now(),

  total_sold          INTEGER,
  total_sales_usd     NUMERIC(12,2),
  avg_sold_price      NUMERIC(10,2),
  median_sold_price   NUMERIC(10,2),
  sell_through_rate   NUMERIC(5,2),
  total_sellers       INTEGER,
  active_listings     INTEGER,

  raw_data            JSONB
);

CREATE INDEX IF NOT EXISTS idx_er_snapshots_kw ON er_terapeak_snapshots(keyword_id, collected_at DESC);

-- 3) 개별 상품 발굴 결과
CREATE TABLE IF NOT EXISTS er_research_items (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID REFERENCES profiles(id) ON DELETE CASCADE,
  keyword_id          BIGINT REFERENCES er_keywords(id) ON DELETE CASCADE,
  snapshot_id         BIGINT REFERENCES er_terapeak_snapshots(id) ON DELETE CASCADE,
  collected_at        TIMESTAMPTZ DEFAULT now(),

  ebay_item_id        TEXT,
  title               TEXT NOT NULL,
  thumbnail_url       TEXT,
  category_id         TEXT,
  category_name       TEXT,

  sold_count_90d      INTEGER,
  avg_sold_price_usd  NUMERIC(10,2),
  min_price_usd       NUMERIC(10,2),
  max_price_usd       NUMERIC(10,2),

  active_listings     INTEGER,
  top_seller_username TEXT,
  top_seller_country  TEXT,

  kr_seller_count     INTEGER,
  total_seller_count  INTEGER,
  kr_seller_ratio     NUMERIC(5,2),

  score               NUMERIC(10,2),

  is_favorited        BOOLEAN DEFAULT false,
  is_listed           BOOLEAN DEFAULT false,
  is_dismissed        BOOLEAN DEFAULT false,
  user_notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_er_items_kw ON er_research_items(keyword_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_er_items_score ON er_research_items(user_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_er_items_fav ON er_research_items(user_id, is_favorited) WHERE is_favorited = true;

-- 4) 스크래핑 실행 로그
CREATE TABLE IF NOT EXISTS er_scrape_runs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          TEXT,
  trigger_type    TEXT,
  keywords_count  INTEGER,
  items_collected INTEGER,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_er_runs_user ON er_scrape_runs(user_id, started_at DESC);

-- ============================================================
-- 점수 계산 함수
-- ============================================================
CREATE OR REPLACE FUNCTION er_calculate_score(
  p_sold_count INTEGER,
  p_avg_price NUMERIC,
  p_active_listings INTEGER,
  p_kr_ratio NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  kr_penalty NUMERIC;
BEGIN
  kr_penalty := CASE
    WHEN p_kr_ratio IS NULL THEN 1.0
    WHEN p_kr_ratio <= 30 THEN 1.0
    WHEN p_kr_ratio <= 50 THEN 1.5
    ELSE 3.0
  END;

  IF COALESCE(p_active_listings, 0) = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(
    (COALESCE(p_sold_count, 0)::NUMERIC / 3.0 * COALESCE(p_avg_price, 0))
    / (p_active_listings * kr_penalty),
    2
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
