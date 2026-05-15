// scraper/src/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const userId = process.env.USER_ID;

if (!url || !key) {
  throw new Error('.env에 SUPABASE_URL과 SUPABASE_SERVICE_KEY를 설정해주세요.');
}
if (!userId) {
  throw new Error('.env에 USER_ID(셀러박스 로그인 후 본인 profiles.id)를 설정해주세요.');
}

export const supabase = createClient(url, key);
export const USER_ID = userId;

export async function getActiveKeywords() {
  const { data, error } = await supabase
    .from('er_keywords').select('*')
    .eq('user_id', USER_ID).eq('is_active', true);
  if (error) throw error;
  return data;
}

export async function createScrapeRun(triggerType, keywordsCount) {
  const { data, error } = await supabase
    .from('er_scrape_runs')
    .insert({
      user_id: USER_ID,
      status: 'running',
      trigger_type: triggerType,
      keywords_count: keywordsCount,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function finishScrapeRun(runId, status, itemsCollected, errorMessage = null) {
  await supabase
    .from('er_scrape_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      items_collected: itemsCollected,
      error_message: errorMessage,
    })
    .eq('id', runId);
}

export async function saveSnapshot(keywordId, aggregate) {
  const { data, error } = await supabase
    .from('er_terapeak_snapshots')
    .insert({
      user_id: USER_ID,
      keyword_id: keywordId,
      total_sold: aggregate.total_sold,
      total_sales_usd: aggregate.total_sales_usd,
      avg_sold_price: aggregate.avg_sold_price,
      sell_through_rate: aggregate.sell_through_rate,
      total_sellers: aggregate.total_sellers,
      active_listings: aggregate.active_listings,
      raw_data: aggregate,
    })
    .select().single();
  if (error) throw error;
  return data;
}

export async function saveItems(keywordId, snapshotId, items) {
  if (!items.length) return [];
  const rows = items.map(it => {
    // 점수 임시 계산 (KR 비율 없으면 1.0)
    const sold = it.sold_count_90d || 0;
    const price = it.avg_sold_price_usd || 0;
    const active = it.active_listings || 1;
    const score = active > 0 ? Math.round((sold / 3) * price / active * 100) / 100 : 0;

    return {
      user_id: USER_ID,
      keyword_id: keywordId,
      snapshot_id: snapshotId,
      ebay_item_id: it.ebay_item_id,
      title: it.title,
      thumbnail_url: it.thumbnail_url,
      sold_count_90d: it.sold_count_90d,
      avg_sold_price_usd: it.avg_sold_price_usd,
      active_listings: it.active_listings,
      top_seller_username: it.top_seller_username,
      score,
    };
  });

  const { data, error } = await supabase.from('er_research_items').insert(rows).select();
  if (error) throw error;
  return data;
}
