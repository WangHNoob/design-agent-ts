---
type: table_schema
title: "表族 boxRecruit"
group: "boxRecruit"
table_count: 6
---

# 表族 `boxRecruit`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `boxRecruit/BoxRecruitPoolRewardQuality` | 2 | boxRecruit/BoxRecruitPoolRewardQuality.xlsx |
| `boxRecruit/BoxRecruitPoolStreamerQuality` | 2 | boxRecruit/BoxRecruitPoolStreamerQuality.xlsx |
| `boxRecruit/BoxRecruitPoolType` | 7 | boxRecruit/BoxRecruitPoolType.xlsx |
| `boxRecruit/_BoxRecruitOpen` | 4 | boxRecruit/_BoxRecruitOpen.xlsx |
| `boxRecruit/_BoxRecruitPool` | 5 | boxRecruit/_BoxRecruitPool.xlsx |
| `boxRecruit/_BoxRecruitPoolReward` | 5 | boxRecruit/_BoxRecruitPoolReward.xlsx |

## 字段明细
### `boxRecruit/BoxRecruitPoolRewardQuality`
- `quality` · `animation`

### `boxRecruit/BoxRecruitPoolStreamerQuality`
- `quality` · `animation`

### `boxRecruit/BoxRecruitPoolType`
- `type` · `costOneTimes` · `canTenTimes` · `desc` · `rewardsShow` · `isOpen` · `isSpecial`

### `boxRecruit/_BoxRecruitOpen`
- `7` · `1` · `9999` · `3`

### `boxRecruit/_BoxRecruitPool`
- `主键` · `类型` · `是否有特殊奖池` · `权重` · `飘带`

### `boxRecruit/_BoxRecruitPoolReward`
- `id` · `poolId` · `weight` · `reward` · `quality`
