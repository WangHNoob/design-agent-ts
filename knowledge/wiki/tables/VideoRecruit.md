---
type: table_schema
title: "表族 VideoRecruit"
group: "VideoRecruit"
table_count: 7
---

# 表族 `VideoRecruit`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `VideoRecruit/groupDifferent/Hero2D` | 14 | VideoRecruit/groupDifferent/Hero2D.xlsx |
| `VideoRecruit/groupDifferent/HeroChange` | 7 | VideoRecruit/groupDifferent/HeroChange.xlsx |
| `VideoRecruit/groupDifferent/HeroVideoPath` | 12 | VideoRecruit/groupDifferent/HeroVideoPath.xlsx |
| `VideoRecruit/new/VideoRecruitConfig` | 2 | VideoRecruit/new/VideoRecruitConfig.xlsx |
| `VideoRecruit/new/VideoRecruitSlider` | 4 | VideoRecruit/new/VideoRecruitSlider.xlsx |
| `VideoRecruit/new/VideoRecruitUI` | 18 | VideoRecruit/new/VideoRecruitUI.xlsx |
| `VideoRecruit/new/VideoRecruitVideo` | 6 | VideoRecruit/new/VideoRecruitVideo.xlsx |

## 字段明细
### `VideoRecruit/groupDifferent/Hero2D`
- `id` · `heroPath` · `heroWH` · `text` · `heroPos` · `heroScaleX` · `heroScaleY` · `serverId`
- `660` · `2048` · `0.322265625` · `760` · `2048` · `0.37109375`

### `VideoRecruit/groupDifferent/HeroChange`
- `id` · `heroId` · `sliderPath` · `textPath` · `text1` · `text2` · `serverId`

**出向外键** (1):
- `heroId` → `Hero`

### `VideoRecruit/groupDifferent/HeroVideoPath`
- `id` · `APKVideoPath` · `inAPK` · `url` · `aimFileName` · `size` · `md5` · `FirstFrame`
- `lowUrl` · `lowSize` · `lowMd5` · `serverId`

### `VideoRecruit/new/VideoRecruitConfig`
- `id` · `value`

### `VideoRecruit/new/VideoRecruitSlider`
- `7` · `1` · `9999` · `2`

### `VideoRecruit/new/VideoRecruitUI`
- `id` · `heroPath` · `heroWH` · `heroPosLeft` · `heroPosRight` · `heroScaleX` · `heroScaleY` · `text`
- `textPosLeft` · `textPosRight` · `textScaleX` · `textScaleY` · `660` · `2048` · `0.322265625` · `760`
- `2048` · `0.37109375`

### `VideoRecruit/new/VideoRecruitVideo`
- `id` · `aimFileName` · `FirstFrame` · `url` · `size` · `md5`
