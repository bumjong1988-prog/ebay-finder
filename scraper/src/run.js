// scraper/src/run.js
// 사용법:
//   npm run scrape                        # 모든 활성 키워드
//   npm run test                          # dry-run (DB 저장 안 함)
//   node src/run.js --keyword="Nike AF1"  # 특정 키워드만
//   TERAPEAK_DEBUG=1 npm run test         # 디버그 모드 (page.pause)

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { scrapeKeyword } from './terapeak.js';
import {
  getActiveKeywords,
  createScrapeRun,
  finishScrapeRun,
  saveSnapshot,
  saveItems,
} from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_FILE = join(__dirname, '..', 'sessions', 'ebay-session.json');

function parseArgs() {
  const args = { keyword: null, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--keyword=')) args.keyword = arg.split('=')[1];
    if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = parseArgs();
  const debug = process.env.TERAPEAK_DEBUG === '1';

  if (!existsSync(SESSION_FILE)) {
    console.error('❌ 세션 파일이 없습니다. 먼저 npm run login 실행하세요.');
    process.exit(1);
  }

  let keywords;
  if (args.keyword) {
    keywords = [{ id: null, keyword: args.keyword }];
    console.log(`🎯 단일 키워드: ${args.keyword}`);
  } else {
    keywords = await getActiveKeywords();
    console.log(`🎯 활성 키워드 ${keywords.length}개 수집 시작`);
  }

  if (!keywords.length) {
    console.log('⚠️  수집할 키워드가 없습니다. ebay-finder.vercel.app에서 등록하세요.');
    return;
  }

  const run = args.dryRun ? null : await createScrapeRun(
    args.keyword ? 'manual' : 'auto',
    keywords.length,
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  let totalItems = 0;
  let errorMsg = null;

  try {
    for (const kw of keywords) {
      try {
        const { aggregate, items } = await scrapeKeyword(page, kw.keyword, { debug });

        if (!args.dryRun && kw.id) {
          const snapshot = await saveSnapshot(kw.id, aggregate);
          await saveItems(kw.id, snapshot.id, items);
        } else {
          console.log('  [dry-run] aggregate:', aggregate);
          console.log(`  [dry-run] items: ${items.length}개`);
          if (items[0]) console.log('  [dry-run] 첫 상품 샘플:', items[0]);
        }

        totalItems += items.length;

        const wait = 5000 + Math.random() * 5000;
        console.log(`  ⏱  ${Math.round(wait / 1000)}초 대기...\n`);
        await sleep(wait);

      } catch (e) {
        console.error(`  ❌ [${kw.keyword}] 실패:`, e.message);
      }
    }
  } catch (e) {
    errorMsg = e.message;
    console.error('전체 실행 실패:', e);
  } finally {
    await browser.close();
    if (run) {
      await finishScrapeRun(
        run.id,
        errorMsg ? 'failed' : 'success',
        totalItems,
        errorMsg,
      );
    }
    console.log(`\n📊 완료: ${totalItems}개 상품 수집`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
