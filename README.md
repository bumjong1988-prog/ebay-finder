# 🔍 eBay 파인더 (ebay-finder)

키워드 기반 eBay 상품 발굴 도구. 셀러박스 본체와 별개 사이트로, **셀러박스 계정으로 그대로 로그인** 가능.

## 구조

```
🌐 ebay-finder.vercel.app
    ↑ 로그인 + 키워드 등록 + 발굴 결과 조회
    │
    ├── api/ebay.js     ← Vercel Serverless (eBay Browse API 프록시)
    └── index.html      ← 대시보드
            ↓ ↑ Supabase 공유 (burgerwang Supabase)
    🗄️  er_keywords, er_research_items 등
            ↑ INSERT
    💻 로컬 PC (사무실 또는 집)
        └── scraper/    ← Playwright Terapeak 스크래퍼
```

다른 도구와의 관계:

```
burgerwang.vercel.app           → 셀러박스 (마진/배송비/판매실적) ← 기존
sellerbox-research.vercel.app   → 셀러박스 복사본 ← 안 건드림
ebay-finder.vercel.app          → 상품 발굴 ← 신규
```

세 사이트 모두 같은 Supabase profiles로 로그인 (계정 공유)

---

## 셋업 (1회만)

### Step 1: Supabase 스키마 적용
1. burgerwang Supabase 콘솔 → SQL Editor
2. `supabase/schema.sql` 내용 붙여넣고 Run

### Step 2: GitHub 새 repo + Vercel 배포
1. github.com → New repository → name: `ebay-finder`
2. ZIP 압축 풀고 → 파일 업로드
3. vercel.com → Add New Project → repo 연결 → Deploy
4. → `ebay-finder.vercel.app` 자동 생성

### Step 3: 본인 USER_ID 확인
1. `ebay-finder.vercel.app` 접속 → 셀러박스 계정으로 로그인
2. Supabase Studio → `profiles` 테이블 → 본인 UUID 복사

### Step 4: 로컬 스크래퍼 셋업
```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env
# .env에 SUPABASE_SERVICE_KEY, USER_ID 입력
```

### Step 5: eBay 로그인
```bash
npm run login
```
브라우저에서 Store 구독 계정으로 로그인 → Enter

---

## 사용
1. 웹에서 키워드 등록
2. 로컬에서 `npm run scrape`
3. 웹에서 결과 확인 (점수순)

## 첫 실행 디버그
```bash
TERAPEAK_DEBUG=1 npm run test
```
→ 브라우저 멈추면 F12로 DOM 확인 후 `scraper/src/terapeak.js` 셀렉터 수정
