---
type: table_schema
title: "表族 teamBoss"
group: "teamBoss"
table_count: 4
---

# 表族 `teamBoss`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `teamBoss/TeamBoss` | 5 | teamBoss/TeamBoss.xlsx |
| `teamBoss/TeamBossBuff` | 4 | teamBoss/TeamBossBuff.xlsx |
| `teamBoss/TeamBossRankReward` | 4 | teamBoss/TeamBossRankReward.xlsx |
| `teamBoss/_TeamBossRobot` | 6 | teamBoss/_TeamBossRobot.xlsx |

## 字段明细
### `teamBoss/TeamBoss`
- `bossId` · `enemyGroupId` · `openTime` · `isOpen` · `teamHurtReward`

### `teamBoss/TeamBossBuff`
- `buffId` · `buffName` · `weight` · `bossSkillInfoId`

**出向外键** (2):
- `bossSkillInfoId` → `fight/BossSkillInfo`
- `buffId` → `fight/_Buff`

### `teamBoss/TeamBossRankReward`
- `id` · `startRank` · `endRank` · `rewards`

### `teamBoss/_TeamBossRobot`
- `id` · `targetId` · `heroStar` · `heroLevel` · `enemyId` · `name`
