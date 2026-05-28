---
type: table_schema
title: "表族 Haki"
group: "Haki"
table_count: 8
---

# 表族 `Haki`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Haki/HakiHero` | 11 | Haki/HakiHero.xlsx |
| `Haki/HakiLink` | 7 | Haki/HakiLink.xlsx |
| `Haki/HakiSkill` | 7 | Haki/HakiSkill.xlsx |
| `Haki/HakiSkillLevel` | 13 | Haki/HakiSkillLevel.xlsx |
| `Haki/HakiSkillLink` | 3 | Haki/HakiSkillLink.xlsx |
| `Haki/HakiSkillPos` | 8 | Haki/HakiSkillPos.xlsx |
| `Haki/HakiTask` | 6 | Haki/HakiTask.xlsx |
| `Haki/HakiTaskReward` | 4 | Haki/HakiTaskReward.xlsx |

## 字段明细
### `Haki/HakiHero`
- `heroId` · `isSP` · `linkHeroIds` · `itemIds` · `hakiLinkIds` · `heroSkillPosIds` · `hero2D` · `connectHeroIds`
- `timelineId` · `itemiconid` · `imgEffectId`

**出向外键** (3):
- `hakiLinkIds` → `Haki/HakiLink`
- `heroId` → `Hero`
- `itemIds` → `Item`

### `Haki/HakiLink`
- `id` · `type` · `parame` · `addition` · `linkHeroId` · `linkedHeroId` · `desc`

**入向外键** (1):
- `Haki/HakiHero.hakiLinkIds` → 本表

### `Haki/HakiSkill`
- `skillId` · `type` · `skillLevelids` · `icon` · `typeName` · `skillName` · `localScale`

**出向外键** (1):
- `skillId` → `fight/Skill`

**入向外键** (2):
- `Haki/HakiSkillLevel.hakiSkillId` → 本表
- `Haki/HakiSkillPos.hakiSkillId` → 本表

### `Haki/HakiSkillLevel`
- `id` · `hakiSkillId` · `level` · `attribute` · `fightBuffId` · `fightskillid` · `linkSkillId` · `desc`
- `needProps` · `needItem` · `refineTime` · `powerFactorB` · `powerFactorC`

**出向外键** (2):
- `hakiSkillId` → `Haki/HakiSkill`
- `fightBuffId` → `fight/FightBuff`

### `Haki/HakiSkillLink`
- `id` · `fightSkillId` · `linkHero`

### `Haki/HakiSkillPos`
- `id` · `posType` · `hakiSkillId` · `row` · `column` · `linkNode` · `prefaceNode` · `effectId`

**出向外键** (1):
- `hakiSkillId` → `Haki/HakiSkill`

### `Haki/HakiTask`
- `id` · `descr` · `needTimes` · `rewards` · `desc` · `heroId`

**出向外键** (1):
- `heroId` → `Hero`

### `Haki/HakiTaskReward`
- `id` · `progress` · `rewards` · `heroId`

**出向外键** (1):
- `heroId` → `Hero`
