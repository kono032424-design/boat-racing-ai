# 競艇AI V5.3
Cloudflare Workers + Static Assets 用。

- `/api/venues`: BOAT RACE公式ページから当日の開催場候補を取得
- `/api/venue`: 選択会場の1R〜12R存在確認
- `public/index.html`: iPhone向けUI

注意: BOAT RACE公式HTMLを読み取る試作方式のため、公式サイトの構造変更等で取得できなくなる可能性があります。
