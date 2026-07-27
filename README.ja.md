# central-mist-webhook-to-google-sheets

English version: [README.md](README.md)

**HPE Aruba Networking Central (New)** / **Aruba Central (Classic)** / **HPE Mist** / **HPE GreenLake Platform (GLP)** のWebhook通知をGoogle Apps Script(GAS)で受信し、1つのGoogle Sheetsにログとして蓄積する。

このリポジトリには、2つのApps Scriptファイルと、4系統すべてのセットアップ手順(Webhookの発生源からGoogle Sheetsに届くところまで)が含まれる。

## なぜGoogle Apps Scriptか

ノートPCのDockerで動かしているダッシュボードは、外部からの着信を直接受けられない。Google Apps Scriptは常時稼働・HTTPS対応・グローバル到達性を無料で持つため、中継先として都合がよい。各プラットフォームはApps ScriptのWebアプリにPOSTし、スクリプトがGoogle Sheetsに行を追記する。下流のツールはそのシートを読むだけでよい。

## 全体アーキテクチャ

![アーキテクチャ](docs/images/webhook_to_sheets_architecture.png)

New Central・Classic Central・Mistの3つは**1つのApps Scriptプロジェクト**(スプレッドシートに紐づいたバインドスクリプト)に同居させ、`?source=`クエリパラメータで振り分ける。GLPだけは**別のApps Scriptプロジェクト**(スタンドアロン、同じスプレッドシートを`openById`で開く)にする。理由は下記「6. GLP(HPE GreenLake Platform)の設定」を参照。

## リポジトリの内容

| パス | 説明 |
|---|---|
| [`apps-script/central-mist/Code.gs`](apps-script/central-mist/Code.gs) | New Central / Classic Central / Mist 用のバインドスクリプト。`?source=`で振り分け、`CentralLog` / `ClassicCentralLog` / `MistLog` に書き込む |
| [`apps-script/glp/Code.gs`](apps-script/glp/Code.gs) | GLP専用のスタンドアロンスクリプト。`GlpLog`に書き込む。使用前に`YOUR_SPREADSHEET_ID`を置き換える |
| `docs/images/` | アーキテクチャ図 |

## 必要なもの

- Googleアカウント(スプレッドシートと2つのApps Scriptプロジェクトを置く)
- 転送元にしたいプラットフォームの管理者権限
  - New Central: API Gateway と Notification Rules
  - Classic Central: Account Home と Alerts & Events
  - Mist: Organization または Site の設定
  - GLP: Manage Workspace → Automations

サーバー・APIトークン・課金は一切不要。

---

## 1. Google Sheetの準備

1. [sheets.new](https://sheets.new/) で新規スプレッドシートを1つ作成する(4系統すべてこの1つのスプレッドシートに集約する)
2. スプレッドシートのIDを控えておく(URLの`/d/`と`/edit`の間の文字列)。GLP用の別プロジェクトから`openById`で参照する際に使う

---

## 2. New Central / Classic Central / Mist 共有プロジェクトのセットアップ

### 2-1. Apps Scriptプロジェクトの作成

1. 1で作ったスプレッドシートのメニューから **拡張機能 → Apps Script**
2. `Code.gs`の中身を全て削除し、[`apps-script/central-mist/Code.gs`](apps-script/central-mist/Code.gs) を貼り付ける
3. 保存(Cmd+S)
4. 関数プルダウンで `testWithDummyData` / `testClassicCentralWithDummyData` / `testMistWithDummyData` をそれぞれ実行し、`CentralLog`・`ClassicCentralLog`・`MistLog`の3シートに色分けされたテストデータが入ることを確認する

### 2-2. Webアプリとしてデプロイ

1. 右上の **デプロイ → 新しいデプロイ**
2. 種類の選択(歯車アイコン)で **ウェブアプリ** を選ぶ
3. 「次のユーザーとして実行」→ **自分**
4. 「アクセスできるユーザー」→ **全員**(各プラットフォームはGoogleアカウントを持たないため必須)
5. **デプロイ**をクリックし、権限の承認を行う
6. 発行された**ウェブアプリのURL**(`https://script.google.com/macros/s/XXXXXXXX/exec`)をコピーする
7. ブラウザで直接そのURLを開き、`{"status":"alive",...}`が返ることを確認する(curlは使わなくてよい。GASのWebアプリURLは`302 Moved Temporarily`でリダイレクトする仕様があり、ブラウザなら自動で追従するが、curlは`-L`が無いと失敗する)

> **コードを更新する場合は「新しいデプロイ」ではなく「デプロイを管理 → 編集(鉛筆) → 新バージョン」を使うこと。** 新しいデプロイを作るとURLが変わり、各プラットフォーム側の設定を都度更新する必要が生じる。

---

## 3. New Central の設定

1. Central画面左側パネルの**メニューアイコン**を選択
2. **API Gateway**カードの**Manage**を選択
3. 左ナビゲーションから**Webhooks**を選択し、右上の**Create Webhooks**をクリック
4. 以下を設定:
   - **Name**: 任意(例: `google-sheets-relay`)
   - **Target URL**: 2-2で取得したURLに`?source=central`を付けたもの

     ```
     https://script.google.com/macros/s/XXXXXXXX/exec?source=central
     ```

   - **Authentication Method**: **API Key**を選択(受信側=Apps Scriptはカスタムヘッダーを検証できないため、値は何でもよい。実際の識別は`source`クエリパラメータで行っている)
5. **Create**で保存
6. メニューアイコンから**Notification Rules**カードの**Manage**を選択し、右上の**Create Rule**をクリック
7. **Select Alerts**(カテゴリ・デバイス種別・アラート種別)と**Minimum Alert Severity**を設定し、配送先として上記Webhookを選択、"Enable this notification rule"にチェックを入れて**Finish**
8. 動作確認: Webhook管理画面の該当Webhookの「…」メニュー内**Test**機能でテスト送信し、`CentralLog`シートに行が追加されることを確認する

参考: [Getting started with webhooks](https://developer.arubanetworks.com/new-central/docs/getting-started-with-webhooks) 、[Webhook authentication](https://developer.arubanetworks.com/new-central/docs/webhook-authentication)

---

## 4. Classic Central の設定

New Centralとは**設定方法もペイロード構造も全く別物**。

| | New Central | Classic Central |
|---|---|---|
| Webhook作成場所 | API Gateway → Webhooks | Account Home → Webhooks |
| アラート紐付け方法 | Notification Rules(複数アラートをまとめて1ルールで設定) | Alerts & Eventsの**各アラート種別ごと**にNotification Optionsで個別にWebhookを指定 |
| ペイロードのキー | `id`, `alertId`, `tenantId`, `impactedEntities`, `additionalDetails` 等 | `id`, `nid`, `alert_type`, `setting_id`, `device_id`, `details{}` 等 |

1. Classic Centralにログインし、**Account Home**を開く
2. **Webhooks**を選択し、新規Webhookを作成
3. **URL**にApps ScriptのURL+`?source=central-classic`を設定

   ```
   https://script.google.com/macros/s/XXXXXXXX/exec?source=central-classic
   ```

4. 保存する(1つのWebhookにつき冗長化用に最大3つまでURLを追加できる)
5. **Network Operations**アプリの**Alerts & Events**ペインを開き、通知したいアラート種別を個別に設定する。主要なものの例:
   - [Access Point Alerts](https://developer.arubanetworks.com/central/docs/ap-alerts): AP Disconnected, Rogue AP Detected, Infrastructure Attack Detected 等
   - [Connectivity Alerts](https://developer.arubanetworks.com/central/docs/connectivity-alerts)
   - [Switch Alerts](https://developer.arubanetworks.com/central/docs/switch-alerts)
   - [Gateway Alerts](https://developer.arubanetworks.com/central/docs/gateway-alerts)
6. 各アラートの**Notification Options**で**Webhook**を選び、3で作成したWebhookを指定する。まずは主要なアラートから有効化し、必要に応じて追加していく
7. 動作確認: 実際にアラートが発生する状況を作る、または待ち、`ClassicCentralLog`シートに行が追加されることを確認する

参考: [Webhooks getting started](https://developer.arubanetworks.com/central/docs/webhooks-getting-started) 、[AP alerts](https://developer.arubanetworks.com/central/docs/ap-alerts) 、[Webhooks HMAC authentication](https://developer.arubanetworks.com/central/docs/webhooks-hmac-authentication)(HMAC認証。ここでは簡易構成のため未実装)

注意: `timestamp`はUnix秒(ミリ秒ではない)。`new Date(timestamp * 1000)`で変換すること。

---

## 5. Mist の設定

### ペイロードの特徴(他3つとの違い)

- 1回のPOSTに複数イベントが**配列(`events`)でまとめて届く**ことがある
- `org_id`・`site_id`はペイロード直下ではなく、**`events`配列内の各イベントオブジェクトの中**に入っている
- **Topic(選んだトピック)ごとにペイロードのキー構成が異なる**(alarms, device-events, minis-application, minis-reachability 等)。共通スキーマは無いため、共通して使えそうな項目を横断的に拾い、無ければ空欄にする設計にしている(全量はRaw JSON列に残す)

### 手順

1. Mistポータルにログインし、**Organization → Settings**(組織全体のWebhookにする場合)、または**Organization → Site Configuration → 該当サイト**(特定サイトのみの場合)を開く
2. **Webhooks**セクションで**Add Webhook**をクリック
3. 以下を設定:
   - **Name**: 任意
   - **Webhook Type**: **HTTP Post**
   - **URL**: Apps ScriptのURLに`?source=mist`を付けたもの

     ```
     https://script.google.com/macros/s/XXXXXXXX/exec?source=mist
     ```

   - **Topics**: 障害調査用途であれば以下に絞ることを推奨
     - 含める: **Alerts**(必須)、**Audits**、**Device Events**、**Device Up/Downs**
     - 外す(高頻度でログが埋まりやすい): Client Join / Client Sessions、Minis Application / Minis Network、NAC Accounting / NAC Events、Mist Edge Events
   - **Secret**: 未設定でよい(簡易構成のため認証は省略)
   - Advanced Settingsの**Verify Certificate**はデフォルト(Yes)のまま
4. **Add**で保存
5. 動作確認: Mistポータルの**Webhook Deliveries**画面で送信ステータスを確認できる。また`MistLog`シートに行が追加されることを確認する(Deliveriesパネルの件数とシートの行数が一致しないことがあるが、これはパネル側の表示期間フィルタによるもので実害があるとは限らない)

参考: Setting up Webhooks in Mist(Mist公式ドキュメント)

注意: `org_id`/`site_id`はペイロード直下ではなくevents配列内にある。直下を見に行くとほぼ必ず空になる。

---

## 6. GLP(HPE GreenLake Platform)の設定

### GLPが他3つと異なる点

- Webhook登録は**API/UIどちらからも可能**。UI: **Manage Workspace → Automations → Webhooks**
- ペイロードは[CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.1/spec.md)標準形式(`specversion`/`type`/`source`/`id`/`time`/`data`)
- 登録時に「Require challenge request handshake」というHMAC検証の仕組みがあるが、**チェックを外せばスキップ可能**。Authentication typeは「No authentication」を選べば、Apps Script側に認証ロジックは不要
- **Destination URLにクエリパラメータを含めることができない**(登録時に`Invalid URL, Error: destination URL must not contain query parameters`というエラーになる)。これが他3つ(New Central/Classic Central/Mist)と決定的に異なる制約
- 対策としてURLパス(`/exec/glp`のような追加パス)を試したが、**Apps ScriptのWebアプリURLに`/exec`より後ろの追加パスを付けると「アクセスできるユーザー:全員」設定が効かなくなりログインが要求される**という別の問題が判明。ブラウザ(ログイン済み)からは正常に見えても、ログインしていない送信元(GLP)からは弾かれてしまうため、この方式は不採用とした

### 対策: GLP専用の別Apps Scriptプロジェクトを作る

クエリパラメータもパスも使えないため、**GLP専用に、装飾のない素の`/exec`URLを持つ別のApps Scriptプロジェクトを新規作成**する。同じスプレッドシートIDを指定して開くことで、シート自体は共有できる。

#### 6-1. 新規プロジェクトの作成

1. 1章で控えたスプレッドシートIDを用意する
2. [script.new](https://script.new/) で**新しい**(スタンドアロンの)Apps Scriptプロジェクトを作成
3. [`apps-script/glp/Code.gs`](apps-script/glp/Code.gs) を貼り付け、`YOUR_SPREADSHEET_ID`を1でコピーしたものに置き換える
4. 保存 → `testGlpWithDummyData`を実行(初回は別プロジェクトなので**改めて権限承認**が必要。対象スプレッドシートへの書き込み許可を求められる) → `GlpLog`シートにテストデータが入ることを確認
5. デプロイ → 新しいデプロイ → ウェブアプリ → 実行ユーザー:自分 / アクセス:全員 → デプロイ
6. 発行された(装飾のない、まっさらな)URLをコピーする

   ```
   https://script.google.com/macros/s/YYYYYYYY/exec
   ```

> このプロジェクトはスプレッドシートに紐づかない(スタンドアロンの)スクリプトのため、Google Driveのプロジェクト一覧でのアイコンが共有プロジェクトと異なって見えるが、動作上の問題はない。

#### 6-2. GLPポータル側のWebhook登録

1. HPE GreenLakeにログインし、ヘッダーのワークスペースメニューから **Manage Workspace**
2. **Automations → Webhooks → Register webhook**
3. フォーム入力:
   - **Name**: 任意
   - **Webhook URL**: 6-1で取得した、装飾のない`/exec`URL(クエリパラメータ・追加パスを一切付けない)
   - **Challenge request**: 「Require challenge request handshake」の**チェックを外す**
   - **Shared secret**: 空欄でよい
   - **Authentication type**: **No authentication**
   - **Batching enabled**: 外しておく(1件ずつ届く方がシンプル)
4. **Register webhook**をクリック
5. 登録したwebhookを開き、**Subscribe to event**で**Service** / **API group** / **Event type**を選択([Event catalog](https://developer.greenlake.hpe.com/docs/greenlake/services#event-catalog)から確認)。1つのWebhookにつき最大5イベントタイプまで購読可能
6. 動作確認: `GlpLog`シートに実データの行が追加されることを確認する。届かない場合は、GLP側の**Delivery**画面で配信試行の有無・ステータスを確認する

参考: [Event service](https://developer.greenlake.hpe.com/docs/greenlake/services/event/public) 、[Webhooks](https://developer.greenlake.hpe.com/docs/greenlake/services/event/public/webhooks) 、[UI](https://developer.greenlake.hpe.com/docs/greenlake/services/event/public/ui)

---

## 7. 共通のハマりどころ・トラブルシューティング

- **`doPost`を2つ定義しない**: JavaScriptは同名関数の後勝ちで、最初の定義は静かに無視される。エラーは出ないが実質デッドコードになる
- **空のログが大量に来る場合**: New Centralで`alert.id`/`alert.alertId`どちらも無いペイロードが届いている可能性がある。`appendAlertToSheet`冒頭のガードにより`Debug`シートに生JSONが記録されるので、そちらで原因を確認する
- **Apps Scriptの「実行数」パネルで行をクリックしても詳細が開かないことがある**: 環境依存の不具合。その場合は`Logger.log`ではなく、シートに直接書き出すデバッグ方式(`Debug`シートの仕組み)に頼る方が確実
- **curlでの動作確認は当てにならないことがある**: GASのWebアプリはPOST応答時に`302 Moved Temporarily`でリダイレクトする仕様があり、そのリダイレクト先(`script.googleusercontent.com/macros/echo?...`)をcurlで取得しようとすると(Cookieの有無に関わらず)失敗することがある。しかし**doPostの実行自体(シートへの書き込み)はリダイレクトが発生する前に完了しており成功している**ことが多い。curlでの確認がうまくいかない場合は、シートに実際に行が追加されているかで判断すること
- **デプロイの更新は「デプロイを管理→編集→新バージョン」を使う**: 「新しいデプロイ」を選ぶとURLが変わり、各プラットフォーム側のWebhook設定を都度更新する必要が生じる
- **数値化されると困るIDは文字列強制する**: 長い数値ID(例: New CentralのsiteId)はSheetsが自動で数値として解釈し、IEEE754の精度限界(15〜17桁程度)で丸めてしまうことがある。値の前に`"'"`を付けて文字列として書き込むことで回避できる(過去に既に丸まって保存されてしまった行は復元不可)
- **Apps ScriptのWebアプリURLに`/exec`より後ろの追加パスを付けない**: ログインが必要な状態になり、外部の送信元(ログインしていないWebhook送信元)からのアクセスが弾かれる。区別が必要な場合はクエリパラメータ(許可されていれば)か、別プロジェクトを使う
- **トークンの寿命等、各プラットフォームのREST API認証と混同しないこと**: これはWebhook専用の設定であり、Central/Mist等のAPIアクセス用のOAuth2トークン等とは無関係

---

## 8. 参考にした実装・記事

- https://github.com/kshimonoj/aruba-webhook-to-gsheet
- https://airheads.hpe.com/discussion/central-webhook-googlenew-central
- https://developer.arubanetworks.com/new-central/docs/getting-started-with-webhooks
- https://developer.arubanetworks.com/new-central/docs/webhook-authentication
- https://developer.arubanetworks.com/central/docs/webhooks-getting-started
- https://developer.arubanetworks.com/central/docs/ap-alerts
- https://developer.arubanetworks.com/central/docs/webhooks-hmac-authentication
- Setting up Webhooks in Mist(Mist公式ドキュメント)
- https://developer.greenlake.hpe.com/docs/greenlake/services/event/public
- https://developer.greenlake.hpe.com/docs/greenlake/services/event/public/webhooks
- https://developer.greenlake.hpe.com/docs/greenlake/services/event/public/ui

## 注意事項

これは意図的に最小構成の中継である。HMAC検証・リトライキュー・重複排除はいずれも実装していない。`/exec`のURLを知った人は誰でもシートに任意の行を書き込めるため、URLは秘密として扱い、汚染されて困るデータにはこの方式を使わないこと。

## ライセンス

[MIT](LICENSE)
