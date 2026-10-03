# クレジット・素材の出典

## ダウンロードした素材（すべて CC0＝パブリックドメイン）

| ファイル | 作者・取得元 | 元の大きさ → 使っている大きさ |
|---|---|---|
| `assets/textures/grass_*.jpg` | Poly Haven「leafy_grass」 https://polyhaven.com/a/leafy_grass | 1k JPG（色1.2MB・法線1.5MB）→ 768px |
| `assets/textures/dirt_*.jpg` | Poly Haven「brown_mud_leaves_01」 https://polyhaven.com/a/brown_mud_leaves_01 | 1k（1.2MB・1.5MB）→ 512px |
| `assets/textures/rock_*.jpg` | Poly Haven「rock_face_03」 https://polyhaven.com/a/rock_face_03 | 1k（0.9MB・1.1MB）→ 768px |
| `assets/textures/sand_*.jpg` | Poly Haven「sand_01」 https://polyhaven.com/a/sand_01 | 1k（0.5MB・0.9MB）→ 512px |
| `assets/textures/bark_*.jpg` | Poly Haven「bark_brown_02」 https://polyhaven.com/a/bark_brown_02 | 1k（0.7MB・1.0MB）→ 512px |
| `assets/models/kenney/*.glb`（16個：テント・たき火・寝床・薪・看板・つぼ・倒木・切り株・遺跡の柱・睡蓮） | Kenney「Nature Kit」v2.1 https://kenney.nl/assets/nature-kit （zip 10,537,521 bytes, SHA-256 `fa7974a0…c4d9d`） | 1個 数KB〜20KB |

- 画像の合計は約1.7MB。取得は `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<名前>/<名前>_diff_1k.jpg`（色）と `_nor_gl_1k.jpg`（法線）。
- `assets/models/kenney/unused/` は、以前使っていた木・岩・草花（今は使っていない。配布版にも入らない）。
- `assets/models/kenney/License.txt` が Kenney の元のライセンス文。

## Blender で作ったもの（オリジナル。他者の素材は使っていない）

Claude が Blender 5.2.2 をスクリプトで操作して作成。共通の部品は `tools/blender/lib.py`。

| モデル | スクリプト | 作り方 |
|---|---|---|
| 焔角竜ザルヴァ `assets/models/monster/zarva.glb`（約2.1MB・3.7万ポリゴン） | `tools/blender/zarva_build.py -- full <出力先>` | 骨格にそってカプセルを並べ、ボクセルで1つに溶かす → うろこの色と凹凸を焼き込み |
| 熔晶竜セクトラ `assets/models/monster/sektra.glb`（約0.6MB） | `tools/blender/sektra_build.py` | ザルヴァと共通の骨格に、黒い装甲・橙色の結晶・節のある尾を新しく造形 |
| 蒼翼竜ヴェイラ `assets/models/monster/veira.glb`（約0.4MB） | `tools/blender/veira_build.py` | 共通の骨格に左右の翼骨を増やし、翼膜・鉤爪・尾翼を新しく造形 |
| 新しい10体 `assets/models/monster/{raizen,gradon,morga,frostra,salda,velum,nebra,galdo,barza,lunax}.glb` | `tools/blender/bestiary_build.py -- <ID>` | 共通リグに個別の体格・角・甲殻・鰭・翼・尾と配色を造形。各体の `.blend` とプレビューも保存 |
| ハンター `assets/models/hunter/hunter.glb`（約2.3MB・3.9万ポリゴン） | `tools/blender/hunter_build.py -- <出力先>` | 体は断面の積み重ね、鎧は厚みのある板 → 鉄・革・布の質感を焼き込み |

作り直すとき：`/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/blender/<スクリプト> -- tools/blender/out` → できた `.glb` を `assets/models/…` へコピー → `node build.mjs`

## プログラムで作ったもの（オリジナル）

- 木・茂み（幹＋葉の板。葉の絵は canvas に描く）・岩・草・雲・水面のさざ波：`js/scenery.js`
- 大剣・太刀・支給品ボックス・骨・卵・地形・空・新しい10種の戦場装飾：`js/hunter.js` `js/world.js` `js/battlefield.js`
- エフェクト（火花・炎・煙・閃光・焦げ跡）：`js/fx.js`
- 効果音：Web Audio でその場で合成
- BGM：ユーザー提供の8曲をブラウザ向け AAC に変換して使用。元ファイルは `タイトルbgm.m4a`、`メニュー画面.m4a`、`戦闘勝利bgm.m4a`、`戦闘敗北bgm.m4a`、`中1の通常戦闘.m4a`、`中3の通常戦闘.m4a`、`章のボス.m4a`、`戦闘よび.m4a`。ゲーム用ファイルは `assets/audio/*.m4a`。

## ライブラリ

- three.js r186（MIT License） https://threejs.org/
- esbuild（MIT License、配布版をつくるときだけ使用）
- Blender 5.2.2（GPL。モデルを作る道具として使用。ゲームには含まれない）

## 注意

非公式のファンメイド作品です。「モンスターハンター」シリーズ（株式会社カプコン）の素材・名称・ロゴ・音楽・画面デザインは使っていません。遊びの手触りだけを参考にしています。
