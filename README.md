# Market Pulse — 無料・キー不要の市場ニュース PWA

世界の決算/市場ニュースと12取引所のリアルタイム状況を表示する PWA です。
**有料API・APIキー一切なし**で動きます。

## 構成

```
index.html              … 画面（UI）
app.js                  … ロジック（PROXY をここで設定）
worker.js               … Cloudflare Worker プロキシ（CORS回避・無料）
manifest.webmanifest    … PWA設定
sw.js                   … Service Worker（オフライン・自動更新）
icon.svg                … アイコン
```

データ元（すべて無料・キー不要）
- 株価/1年チャート … Yahoo Finance の公開エンドポイント
- ニュース … Google ニュース RSS（日本語）

ブラウザから直接これらを叩くと **CORS** で拒否されるため、間に無料の Cloudflare Worker を1個だけ挟みます。

---

## セットアップ（約15分）

### 1. Worker を立てる（無料・カード不要）
1. https://workers.cloudflare.com で無料アカウント作成
2. 「Create Worker」→ エディタに `worker.js` の中身を貼り付け → **Deploy**
3. 払い出される URL（例 `https://market-pulse.xxx.workers.dev`）を控える
   - 無料枠：1日10万リクエスト

### 2. アプリに URL を設定
`app.js` の先頭：
```js
const PROXY = "https://market-pulse.xxx.workers.dev"; // ← ここに貼る
```

### 3. 公開（無料ホスティング）
以下のどれでも可：
- **GitHub Pages** … リポジトリに6ファイルを置き Settings→Pages を有効化
- **Cloudflare Pages** / **Netlify** … フォルダをドラッグ＆ドロップ

※ Service Worker と PWA は **https** が必須です（上記サービスは自動でhttps）。

### 4. スマホにインストール
- **Android (Chrome)**：メニュー →「アプリをインストール / ホーム画面に追加」
- **iPhone (Safari)**：共有 →「ホーム画面に追加」

---

## 自動更新について（正直な制約）

| 状況 | PC | Android | iPhone |
|---|---|---|---|
| アプリを開いている間の15分更新 | ✅ | ✅ | ✅ |
| アプリを閉じた状態での自動更新 | △ | △（Periodic Sync, 保証なし） | ❌ iOSは非対応 |

iOS Safari は「閉じている間の定期バックグラウンド更新」に対応していません。
**閉じていても更新→通知したい**場合は、次の無料拡張が必要です（任意・フェーズ2）：

- Cloudflare Worker の **Cron Triggers**（無料）で15分ごとにデータ取得
- **Web Push** で端末へ通知（iOS 16.4+ はホーム追加済みPWAなら受信可）
- 購読情報の保存に **Cloudflare KV**（無料枠あり）

必要になったら、この Cron + Push 部分のコードも追加できます。

---

## カスタマイズ

- セクターと銘柄は `app.js` の `SECTORS` を編集（Yahoo記法：日本株は `7203.T`、香港 `0700.HK`、ロンドン `BP.L`、ドイツ `SAP.DE`、パリ `MC.PA`、トロント `SHOP.TO`、上海 `600519.SS`、サウジ `2222.SR`、インドNSE `RELIANCE.NS`）
- 更新間隔は `app.js` の `REFRESH_MS`
- 「上昇/好調」「下落/不調」は現在 **当日変化率** で並べています。決算ベースに変えたい場合は並び替えロジックを調整

---

## 注意

本アプリは公開データの収集・表示による**情報提供のみ**を目的とし、投資助言ではありません。
データは遅延・欠落・誤りを含む場合があります。投資判断はご自身の責任で、一次情報をご確認ください。
Yahoo Finance / Google ニュースは各社の利用規約に従ってご利用ください（個人利用の範囲を想定）。
