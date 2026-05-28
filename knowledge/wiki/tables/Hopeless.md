---
type: table_schema
title: "表族 Hopeless"
group: "Hopeless"
table_count: 5
---

# 表族 `Hopeless`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Hopeless/HopelessChallengeBossTask` | 6 | Hopeless/HopelessChallengeBossTask.xlsx |
| `Hopeless/HopelessChallengeChapter` | 6 | Hopeless/HopelessChallengeChapter.xlsx |
| `Hopeless/HopelessChallengeChapterExplain` | 3 | Hopeless/HopelessChallengeChapterExplain.xlsx |
| `Hopeless/HopelessChallengeRankReward` | 5 | Hopeless/HopelessChallengeRankReward.xlsx |
| `Hopeless/_HopelessChallenge` | 15 | Hopeless/_HopelessChallenge.xlsx |

## 字段明细
### `Hopeless/HopelessChallengeBossTask`
- `id` · `targetType` · `target` · `leftText` · `targetText` · `leftTextValue`

### `Hopeless/HopelessChallengeChapter`
- `id` · `name` · `bigIcon` · `recommendHeroId` · `explainLeftTextureId` · `explainSpecialBuffId`

### `Hopeless/HopelessChallengeChapterExplain`
- `id` · `resource` · `text`

### `Hopeless/HopelessChallengeRankReward`
- `id` · `type` · `rankBefor` · `rankAfter` · `rewards`

### `Hopeless/_HopelessChallenge`
- `id` · `战斗地图` · `关卡Id` · `章节` · `关卡怪物` · `是否为boss关` · `是否全组通关解锁` · `解锁挑战条件`
- `通关积分` · `积分计算方式` · `每关通关奖励` · `时间分组` · `boss关获得积分条件` · `试玩关卡标记` · `备注`
