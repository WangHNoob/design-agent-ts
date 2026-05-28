---
type: table_schema
title: "表族 recruitSP"
group: "recruitSP"
table_count: 4
---

# 表族 `recruitSP`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `recruitSP/SPRecruitConfig` | 13 | recruitSP/SPRecruitConfig.xlsx |
| `recruitSP/SPRecruitMainHero` | 6 | recruitSP/SPRecruitMainHero.xlsx |
| `recruitSP/_SPRecruitPool` | 5 | recruitSP/_SPRecruitPool.xlsx |
| `recruitSP/_SPRecruitPoolReward` | 5 | recruitSP/_SPRecruitPoolReward.xlsx |

## 字段明细
### `recruitSP/SPRecruitConfig`
- `id` · `costItem` · `rewardItem` · `finalRewardNum` · `finalRewardOpenCond` · `mainHero` · `showMainHeroWeight` · `showMainHeroUpperWeight`
- `upHeroNum` · `upHero` · `showUpperHeroWeight` · `showUpHeroUpperWeight` · `upperWeightHeroStarLimit`

### `recruitSP/SPRecruitMainHero`
- `heroId` · `hero2D` · `heroModel` · `herobg` · `scene` · `contactPoint`

**出向外键** (1):
- `heroId` → `Hero`

### `recruitSP/_SPRecruitPool`
- `主键` · `权重` · `前多少次必不能出限制` · `選中卡尺星級滿足概率提升` · `EmptyKey-E2`

### `recruitSP/_SPRecruitPoolReward`
- `id` · `heroId` · `poolId` · `weight` · `upperWeight`

**出向外键** (1):
- `heroId` → `Hero`
