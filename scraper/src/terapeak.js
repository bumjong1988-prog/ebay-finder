// scraper/src/terapeak.js
// Terapeak Product Research에서 키워드 검색 결과 수집
//
// ⚠️ eBay UI는 자주 변경됩니다. 셀렉터가 깨지면 첫 실행 시 직접 확인 필요.
// 디버그 모드: TERAPEAK_DEBUG=1 환경변수로 실행하면 페이지 일시정지

const TERAPEAK_URL = 'https://www.ebay.com/sh/research';

export async function scrapeKeyword(page, keyword, opts = {}) {
  const { debug = false } = opts;
  console.log(`  🔍 [${keyword}] 수집 시작`);

  await page.goto(TERAPEAK_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // 검색창 셀렉터 (Terapeak UI 변경 시 여기 수정)
  const searchSelectors = [
    'input[placeholder*="Search" i]',
    'input[type="search"]',
    'input[name="keywords"]',
    'input.search-input',
  ];

  let searchInput = null;
  for (const sel of searchSelectors) {
    try {
      const el = await page.waitForSelector(sel, { timeout: 1000 });
      if (el) { searchInput = el; break; }
    } catch(e) {}
  }

  if (!searchInput) {
    if (debug) {
      console.log('⚠️  검색창을 못 찾았습니다. 브라우저에서 직접 확인하세요.');
      await page.pause();
    }
    throw new Error('Terapeak 검색창을 못 찾았습니다. 셀렉터 확인 필요.');
  }

  await searchInput.fill(keyword);
  await searchInput.press('Enter');
  console.log(`  ⏳ 결과 로딩 대기...`);
  await page.waitForTimeout(6000);

  if (debug) {
    console.log('📸 디버그: 페이지 일시정지. 셀렉터 확인 후 resume.');
    await page.pause();
  }

  // 집계 데이터 파싱
  // ⚠️ 실제 셀렉터는 첫 실행 시 페이지 보고 확정
  const aggregate = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const num = parseFloat(el.textContent.replace(/[^\d.]/g, ''));
      return isNaN(num) ? null : num;
    };

    return {
      total_sold: get('[data-testid="sold-count"]') || get('.metric-sold-count'),
      total_sales_usd: get('[data-testid="total-sales"]') || get('.metric-total-sales'),
      avg_sold_price: get('[data-testid="avg-price"]') || get('.metric-avg-price'),
      sell_through_rate: get('[data-testid="sell-through-rate"]') || get('.metric-str'),
      total_sellers: get('[data-testid="sellers"]') || get('.metric-sellers'),
      active_listings: get('[data-testid="active-listings"]') || get('.metric-active'),
      _debug_page_text: document.body.innerText.slice(0, 2000),
    };
  });

  // 개별 상품 리스트 파싱
  const items = await page.evaluate(() => {
    const rows = document.querySelectorAll(
      'tr.research-item, [data-testid="research-row"], .research-table-row'
    );
    return Array.from(rows).slice(0, 30).map(row => {
      const t = (sel) => row.querySelector(sel)?.textContent?.trim();
      const a = (sel) => row.querySelector(sel)?.getAttribute('href');
      const img = (sel) => row.querySelector(sel)?.getAttribute('src');
      const numOnly = (s) => {
        if (!s) return null;
        const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
        return isNaN(n) ? null : n;
      };
      return {
        title: t('.item-title, [data-testid="title"]'),
        thumbnail_url: img('img'),
        item_url: a('a.item-link, a[data-testid="item-link"]'),
        sold_count_90d: numOnly(t('.item-sold-count, [data-testid="sold"]')),
        avg_sold_price_usd: numOnly(t('.item-avg-price, [data-testid="price"]')),
        active_listings: numOnly(t('.item-active, [data-testid="active"]')),
      };
    }).filter(i => i.title);
  });

  console.log(`  ✅ [${keyword}] 집계: sold=${aggregate.total_sold ?? '?'}, 평균가=$${aggregate.avg_sold_price ?? '?'} / 상품 ${items.length}개`);

  return { aggregate, items };
}
