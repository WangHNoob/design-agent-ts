---
type: table_schema
title: "表族 CelebrationServer"
group: "CelebrationServer"
table_count: 8
---

# 表族 `CelebrationServer`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `CelebrationServer/CelebrationServerCollectionRank` | 4 | CelebrationServer/CelebrationServerCollectionRank.xlsx |
| `CelebrationServer/CelebrationServerFightPowerRank` | 4 | CelebrationServer/CelebrationServerFightPowerRank.xlsx |
| `CelebrationServer/CelebrationServerIntegralRank` | 4 | CelebrationServer/CelebrationServerIntegralRank.xlsx |
| `CelebrationServer/CelebrationServerLevel` | 4 | CelebrationServer/CelebrationServerLevel.xlsx |
| `CelebrationServer/CelebrationServerMainStory` | 4 | CelebrationServer/CelebrationServerMainStory.xlsx |
| `CelebrationServer/CelebrationServerRank` | 2 | CelebrationServer/CelebrationServerRank.xlsx |
| `CelebrationServer/CelebrationServerUnionRank` | 5 | CelebrationServer/CelebrationServerUnionRank.xlsx |
| `CelebrationServer/_CelebrationServerActivityConfig` | 4 | CelebrationServer/_CelebrationServerActivityConfig.xlsx |

## 字段明细
### `CelebrationServer/CelebrationServerCollectionRank`
- `id` · `rankStart` · `rankEnd` · `rankRewards`

### `CelebrationServer/CelebrationServerFightPowerRank`
- `id` · `rankStart` · `rankEnd` · `rankRewards`

### `CelebrationServer/CelebrationServerIntegralRank`
- `id` · `rankStart` · `rankEnd` · `rankRewards`

### `CelebrationServer/CelebrationServerLevel`
- `id` · `endTime` · `targetLevel` · `rewards`

### `CelebrationServer/CelebrationServerMainStory`
- `rankId` · `rankStart` · `rankEnd` · `rankRewards`

### `CelebrationServer/CelebrationServerRank`
- `rankId` · `endTime`

### `CelebrationServer/CelebrationServerUnionRank`
- `id` · `rankStart` · `rankEnd` · `rankRewards` · `unionRewards`

### `CelebrationServer/_CelebrationServerActivityConfig`
- `id` · `startTime` · `endTime` · `param`
