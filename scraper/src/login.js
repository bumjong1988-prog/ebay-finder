// scraper/src/login.js
// 최초 1회 실행: eBay에 직접 로그인하고 세션을 저장합니다.
// 저장된 세션은 이후 자동 스크래핑에 재사용됩니다.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSIONS_DIR = join(__dirname, '..', 'sessions');
const SESSION_FILE = join(SESSIONS_DIR, 'ebay-session.json');

async function main() {
  mkdirSync(SESSIONS_DIR, { recursive: true });

  console.log('🔓 브라우저를 엽니다...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto('https://signin.ebay.com/');
  console.log('\n📝 브라우저에서 eBay에 로그인해주세요.');
  console.log('   ⚠️  Store 구독 중인 계정으로 로그인하세요 (Terapeak 접근 권한 필요)');
  console.log('\n   로그인 완료 후, 이 터미널에서 Enter를 눌러주세요...');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('', () => { rl.close(); resolve(); }));

  // Terapeak 접근 확인
  console.log('🔍 Terapeak 접근 권한 확인 중...');
  await page.goto('https://www.ebay.com/sh/research');
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('signin')) {
    console.log('❌ 로그인이 안 되어 있습니다. 다시 시도해주세요.');
    await browser.close();
    return;
  }

  await context.storageState({ path: SESSION_FILE });
  console.log(`\n✅ 세션 저장 완료: ${SESSION_FILE}`);
  console.log('   이제 npm run scrape 실행 가능합니다.\n');

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
