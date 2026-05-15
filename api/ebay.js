// api/ebay.js
// Vercel Serverless Function - eBay Browse API 프록시
//
// 용도:
//  - GET /api/ebay?action=search&q=Nike+Air+Force&limit=50
//      → eBay 활성 리스팅 검색 (셀러 국가 분석용)
//  - GET /api/ebay?action=token
//      → OAuth Application 토큰 발급 (Browse API용)
//
// 환경변수 필요 (Vercel 프로젝트 설정):
//  - EBAY_APP_ID       : eBay developer App ID
//  - EBAY_CERT_ID      : eBay developer Cert ID
//  - EBAY_DEV_ID       : (선택)

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1';

// 토큰 캐시 (서버리스 함수 인스턴스 메모리)
let _cachedToken = null;
let _tokenExpiry = 0;

async function getAppToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiry - 60_000) {
    return _cachedToken;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error('EBAY_APP_ID 또는 EBAY_CERT_ID 환경변수가 설정되지 않았습니다.');
  }

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');

  const res = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`eBay OAuth 실패: ${res.status} ${errText}`);
  }

  const data = await res.json();
  _cachedToken = data.access_token;
  _tokenExpiry = now + (data.expires_in * 1000);
  return _cachedToken;
}

async function searchItems(query, limit = 50) {
  const token = await getAppToken();
  const url = `${EBAY_BROWSE_URL}/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`eBay Browse API 실패: ${res.status} ${errText}`);
  }

  return await res.json();
}

// 셀러 국가 분포 분석
function analyzeSellers(searchResult) {
  const items = searchResult.itemSummaries || [];
  const countryCount = {};
  const sellerSet = new Set();

  items.forEach(it => {
    const country = it.itemLocation?.country || 'UNKNOWN';
    countryCount[country] = (countryCount[country] || 0) + 1;
    if (it.seller?.username) sellerSet.add(it.seller.username);
  });

  const total = items.length;
  const kr = countryCount['KR'] || 0;
  const us = countryCount['US'] || 0;
  const cn = countryCount['CN'] || 0;

  return {
    total_listings: total,
    unique_sellers: sellerSet.size,
    country_distribution: countryCount,
    kr_count: kr,
    kr_ratio: total > 0 ? Math.round(kr / total * 1000) / 10 : 0,
    us_ratio: total > 0 ? Math.round(us / total * 1000) / 10 : 0,
    cn_ratio: total > 0 ? Math.round(cn / total * 1000) / 10 : 0,
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || 'search';

  try {
    if (action === 'token') {
      const token = await getAppToken();
      return res.status(200).json({ ok: true, token_prefix: token.slice(0, 20) + '...' });
    }

    if (action === 'search') {
      const q = req.query.q;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      if (!q) return res.status(400).json({ ok: false, error: 'q 파라미터 필요' });

      const result = await searchItems(q, limit);
      const analysis = analyzeSellers(result);

      return res.status(200).json({
        ok: true,
        query: q,
        analysis,
        items: (result.itemSummaries || []).slice(0, 20).map(it => ({
          item_id: it.itemId,
          title: it.title,
          price: it.price?.value,
          currency: it.price?.currency,
          country: it.itemLocation?.country,
          seller: it.seller?.username,
          seller_feedback: it.seller?.feedbackPercentage,
          thumbnail: it.thumbnailImages?.[0]?.imageUrl,
          item_url: it.itemWebUrl,
        })),
        total_in_search: result.total || 0,
      });
    }

    return res.status(400).json({ ok: false, error: '알 수 없는 action' });

  } catch (e) {
    console.error('API 오류:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
