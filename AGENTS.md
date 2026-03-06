# ARCHITECTURE.md — BatchMaster

## Overview

BatchMaster はスタンドアローンの JUCE アプリケーション。  
VST3/AU プラグインをチェーン化し、複数オーディオファイルをオフラインでバッチ処理する。  
GUI は React（WebView）、処理エンジンは JUCE C++ で構成される。

---

## ディレクトリ構成

```
BatchMaster/
├── CMakeLists.txt
├── Source/
│   ├── Main.cpp                    # JUCEアプリエントリポイント
│   ├── MainComponent.h/cpp         # ルートコンポーネント（WebView統合）
│   ├── core/
│   │   ├── PluginScanner.h/cpp     # VST3/AUスキャン
│   │   ├── PluginChain.h/cpp       # プラグインチェーン管理
│   │   ├── OfflineRenderer.h/cpp   # オフラインレンダリング
│   │   ├── BatchProcessor.h/cpp    # バッチキュー処理
│   │   └── PresetManager.h/cpp     # .vstpreset / JSON プリセット管理
│   ├── bridge/
│   │   └── JSBridge.h/cpp          # JS ↔ C++ バインディング
│   └── io/
│       └── ChainSerializer.h/cpp   # .bmchain.json 保存/読み込み
├── ui/                             # React フロントエンド
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── PluginLibrary.tsx   # プラグインリスト・選択
│   │   │   ├── ChainEditor.tsx     # ドラッグ＆ドロップチェーン
│   │   │   ├── PresetSelector.tsx  # プリセット選択
│   │   │   ├── BatchQueue.tsx      # バッチジョブ一覧・進捗
│   │   │   └── SavedChains.tsx     # 保存済みチェーン管理
│   │   ├── hooks/
│   │   │   ├── useJUCEBridge.ts    # window.__JUCE__ ラッパー
│   │   │   └── useBatchProgress.ts # 進捗ポーリング
│   │   └── types/
│   │       └── index.ts            # Plugin, ChainItem, BatchJob 型定義
│   └── dist/                       # ビルド成果物（BinaryDataに埋め込む）
├── specs/
│   ├── requirements.md
│   ├── design.md
│   └── implementation-plan.md
└── .agent/
    ├── scratchpad.md
    ├── iteration.log
    └── errors.log
```

---

## レイヤー構成

```
┌──────────────────────────────────────────────┐
│              React UI (WebView)               │
│   PluginLibrary | ChainEditor | BatchQueue    │
│              useJUCEBridge.ts                 │
└──────────────────────┬───────────────────────┘
          window.__JUCE__.backend.*
┌──────────────────────▼───────────────────────┐
│                 JSBridge (C++)                │
│   bind("scanPlugins")  bind("loadChain")      │
│   bind("startBatch")   bind("getProgress")    │
│   emit("progress.update") emit("batch.done")  │
└──────────┬───────────────────┬───────────────┘
           │                   │
┌──────────▼──────────┐  ┌────▼──────────────────┐
│   PluginScanner     │  │   BatchProcessor       │
│   - VST3/AU検索     │  │   - ジョブキュー管理   │
│   - KnownPluginList │  │   - Thread派生クラス   │
└─────────────────────┘  └────┬──────────────────┘
                               │
               ┌───────────────▼──────────────┐
               │         PluginChain          │
               │  - AudioPluginInstance[]     │
               │  - prepareToPlay / process   │
               └───────────────┬──────────────┘
                               │
               ┌───────────────▼──────────────┐
               │       OfflineRenderer        │
               │  AudioFormatReader           │
               │  → processBlock() × N        │
               │  → AudioFormatWriter         │
               └──────────────────────────────┘
```

---

## JS ↔ C++ ブリッジ仕様

### C++ → JS（登録する関数）

| 関数名 | 引数 | 戻り値 | 説明 |
|--------|------|--------|------|
| `scanPlugins` | `folderPath: string` | `Plugin[]` | 指定フォルダをスキャン |
| `getPluginList` | なし | `Plugin[]` | キャッシュ済みリストを返す |
| `loadPresets` | `pluginId: string` | `string[]` | プラグインのプリセット一覧 |
| `loadPresetFile` | `pluginId, filePath` | `boolean` | .vstpreset をロード |
| `loadChain` | `chainJSON: string` | `boolean` | チェーンをC++に適用 |
| `saveChain` | `name, chainJSON` | `boolean` | .bmchain.json に保存 |
| `getSavedChains` | なし | `SavedChain[]` | 保存済みチェーン一覧 |
| `addBatchJob` | `inputPath, outputPath` | `string` (jobId) | ジョブをキューに追加 |
| `startBatch` | なし | `boolean` | バッチ処理開始 |
| `getProgress` | なし | `Progress` | 現在の進捗を返す |
| `cancelBatch` | なし | `boolean` | 処理中断 |

### JS → C++（イベント通知）

```typescript
// C++からJS側に非同期でプッシュ
type ProgressEvent = {
  type: "progress.update";
  jobId: string;
  file: string;
  percent: number;   // 0.0 - 1.0
  done: boolean;
};

type BatchDoneEvent = {
  type: "batch.done";
  totalFiles: number;
  elapsed: number; // seconds
};
```

JUCE 7 の `WebBrowserComponent::emitEventIfBrowserIsVisible()` で送信。

---

## 型定義（TypeScript / C++ 共通）

```typescript
// ui/src/types/index.ts

type Plugin = {
  id: string;           // ファイルパスのハッシュ
  name: string;
  vendor: string;
  category: string;     // "EQ" | "Compressor" | "Limiter" | "Mastering" ...
  path: string;         // VST3/AUファイルパス
  hasPresets: boolean;
};

type ChainItem = {
  uid: number;          // UI内一意ID
  pluginId: string;
  name: string;
  vendor: string;
  category: string;
  preset: string;       // プリセット名 or "__file__"
  presetFilePath?: string;
  enabled: boolean;
};

type BatchJob = {
  id: string;
  inputFile: string;
  outputFile: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;     // 0.0 - 1.0
  errorMessage?: string;
};

type SavedChain = {
  name: string;
  createdAt: string;    // ISO8601
  chain: ChainItem[];
};
```

---

## .bmchain.json フォーマット

```json
{
  "version": 1,
  "name": "Club Master",
  "createdAt": "2025-03-06T12:00:00+09:00",
  "chain": [
    {
      "pluginId": "abc123",
      "pluginPath": "/Library/Audio/Plug-Ins/VST3/iZotope/Ozone 12.vst3",
      "name": "Ozone 12",
      "preset": "Streaming Master",
      "presetFilePath": null,
      "enabled": true
    },
    {
      "pluginId": "def456",
      "pluginPath": "/Library/Audio/Plug-Ins/VST3/FabFilter/Pro-L 2.vst3",
      "name": "Pro-L 2",
      "preset": "Transparent",
      "presetFilePath": null,
      "enabled": true
    }
  ]
}
```

保存場所: `~/Library/Application Support/BatchMaster/chains/`（macOS）

---

## OfflineRenderer 処理フロー

```
1. plugin->setNonRealtime(true)          // オフライン処理フラグ
2. plugin->prepareToPlay(sr, BLOCK_SIZE)
3. latency = plugin->getLatencySamples() // レイテンシー補正
4. プリロール: latency分の無音を送り込む（出力を捨てる）
5. メインループ: AudioFormatReader → processBlock() → AudioFormatWriter
6. テール処理: plugin->getTailLengthSeconds() 分の無音を追加送り込み
7. plugin->releaseResources()
```

BLOCK_SIZE: `4096`（オフラインなので大きめ）  
出力フォーマット: WAV 32bit float（デフォルト）、入力と同じサンプルレート

---

## フロントエンドビルド統合

### 開発時
```bash
cd ui && npm run dev   # localhost:3000
# MainComponent.cpp の goToURL を "http://localhost:3000" に切り替え
```

### 本番ビルド
```bash
cd ui && npm run build  # ui/dist/ に出力
# CMakeLists.txt で dist/ を BinaryData としてコンパイル
# WebBrowserComponent::ResourceProvider でサーブ
```

```cmake
# CMakeLists.txt 抜粋
juce_add_binary_data(UIResources SOURCES
    ui/dist/index.html
    ui/dist/assets/index.js
    ui/dist/assets/index.css
)
target_link_libraries(BatchMaster PRIVATE UIResources)
```

---

## 注意事項・既知の制約

| 項目 | 内容 |
|------|------|
| ライセンス認証 | iZotope製品はiLok確認あり。ヘッドレスでも認証済みマシンなら動作する |
| AIマスタリング | Ozone AI Master はGUI初期化が必要な場合あり。初回はGUI経由で実行推奨 |
| スレッド | `processBlock()` はバックグラウンドスレッドで実行。JSへのコールバックは `juce::MessageManager::callAsync` 経由 |
| WebView | JUCE 7.0.5以上が必要。`JUCE_WEB_BROWSER=1` をCMakeで有効化 |
| macOS | AUスキャンには `AudioUnit.framework` リンクが必要 |
| Windows | VST3のみ対応。`C:\Program Files\Common Files\VST3` をデフォルトスキャン |
