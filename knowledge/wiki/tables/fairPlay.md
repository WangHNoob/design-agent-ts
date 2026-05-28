---
type: table_schema
title: "表族 fairPlay"
group: "fairPlay"
table_count: 8
---

# 表族 `fairPlay`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `fairPlay/FairPlayHero` | 22 | fairPlay/FairPlayHero.xlsx |
| `fairPlay/FairPlayHeroPool` | 3 | fairPlay/FairPlayHeroPool.xlsx |
| `fairPlay/FairPlaySeason` | 11 | fairPlay/FairPlaySeason.xlsx |
| `fairPlay/FairPlaySeasonRankReward` | 8 | fairPlay/FairPlaySeasonRankReward.xlsx |
| `fairPlay/FairPlayTask` | 9 | fairPlay/FairPlayTask.xlsx |
| `fairPlay/_CommonEntireRankGroup` | 6 | fairPlay/_CommonEntireRankGroup.xlsx |
| `fairPlay/_FairPlayFinalsPlayer` | 3 | fairPlay/_FairPlayFinalsPlayer.xlsx |
| `fairPlay/_FairPlayFinalsStage` | 3 | fairPlay/_FairPlayFinalsStage.xlsx |

## 字段明细
### `fairPlay/FairPlayHero`
- `英雄Id
Hero.xlsx` · `EmptyKey-B2` · `EmptyKey-C2` · `默认主动技能... skillId&skillId` · `可选主动技能... skillId&skillId` · `英雄角色相关参数：
1男性
2女性
3人妖
4草帽团
5海盗
6海军
7七武海
8四皇
9世界政府
10动物系
11自然系
12超人系` · `血量` · `攻击`
- `防御` · `速度` · `暴击` · `抗暴` · `命中` · `闪避` · `暴击伤害系数` · `格挡`
- `破击` · `抗全` · `格挡伤害` · `治疗暴击系数` · `特殊技能` · `EmptyKey-V2`

**入向外键** (1):
- `fairPlay/FairPlayHeroPool.fairPlayHeroIds` → 本表

### `fairPlay/FairPlayHeroPool`
- `id` · `num` · `fairPlayHeroIds`

**出向外键** (1):
- `fairPlayHeroIds` → `fairPlay/FairPlayHero`

### `fairPlay/FairPlaySeason`
- `id` · `startDateTime` · `preStartTime` · `preEndTime` · `preStopSettleTime` · `preSendRewardTime` · `semiStartTime` · `semiEndTime`
- `semiStopSettleTime` · `endDateTime` · `semiSendRewardTime`

### `fairPlay/FairPlaySeasonRankReward`
- `id` · `rankBefor` · `rankAfter` · `targetCount` · `titleId` · `itemReward` · `cupPicName` · `seasonStage`

**出向外键** (1):
- `titleId` → `Title`

### `fairPlay/FairPlayTask`
- `id` · `dayOrWeek` · `taskType` · `num` · `param` · `reward` · `description` · `name`
- `taskIcon`

### `fairPlay/_CommonEntireRankGroup`
- `id` · `类型` · `开始server` · `结束server` · `赛季阶段stage` · `绝境挑战关卡组`

### `fairPlay/_FairPlayFinalsPlayer`
- `id` · `playerId` · `groupId`

### `fairPlay/_FairPlayFinalsStage`
- `finalsStage` · `startTime` · `endTime`
