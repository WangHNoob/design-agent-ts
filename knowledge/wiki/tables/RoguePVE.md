---
type: table_schema
title: "表族 RoguePVE"
group: "RoguePVE"
table_count: 11
---

# 表族 `RoguePVE`

共 11 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `RoguePVE/RogueChapter` | 5 | RoguePVE/RogueChapter.xlsx |
| `RoguePVE/RogueDifficulty` | 7 | RoguePVE/RogueDifficulty.xlsx |
| `RoguePVE/RogueEvent` | 13 | RoguePVE/RogueEvent.xlsx |
| `RoguePVE/RogueHandBook` | 4 | RoguePVE/RogueHandBook.xlsx |
| `RoguePVE/RogueHero` | 11 | RoguePVE/RogueHero.xlsx |
| `RoguePVE/RogueRankConfig` | 2 | RoguePVE/RogueRankConfig.xlsx |
| `RoguePVE/RogueRankReward` | 5 | RoguePVE/RogueRankReward.xlsx |
| `RoguePVE/RogueReset` | 3 | RoguePVE/RogueReset.xlsx |
| `RoguePVE/RogueSkill` | 10 | RoguePVE/RogueSkill.xlsx |
| `RoguePVE/RogueSkillQuility` | 3 | RoguePVE/RogueSkillQuility.xlsx |
| `RoguePVE/RogueTalent` | 16 | RoguePVE/RogueTalent.xlsx |

## 字段明细
### `RoguePVE/RogueChapter`
- `id` · `chapter` · `level` · `eventId` · `difficulty`

### `RoguePVE/RogueDifficulty`
- `id` · `dId` · `name` · `info` · `firstChapterId` · `bossChapterId` · `deBuff`

### `RoguePVE/RogueEvent`
- `eventId` · `icon` · `firstReward` · `reward` · `eventType` · `selectCount` · `eventName` · `enemyScore`
- `monsterWeight` · `powerWeight` · `passScore` · `eventSubName` · `fightMapId`

### `RoguePVE/RogueHandBook`
- `id` · `heroId` · `skillId` · `info`

**出向外键** (2):
- `heroId` → `Hero`
- `skillId` → `fight/Skill`

### `RoguePVE/RogueHero`
- `heroId` · `star` · `lv` · `skill_1` · `skill_2` · `skill_3` · `skill_4` · `activeSkill`
- `passiveSkill` · `attributeBase` · `skill_0`

**出向外键** (1):
- `heroId` → `Hero`

### `RoguePVE/RogueRankConfig`
- `rankId` · `name`

### `RoguePVE/RogueRankReward`
- `id` · `type` · `rankBefore` · `rankAfter` · `rewards`

### `RoguePVE/RogueReset`
- `num` · `cost` · `refreshCost`

### `RoguePVE/RogueSkill`
- `id` · `skillId` · `heroId` · `skillType` · `quality` · `talent` · `chapterId` · `eventType`
- `unlockId` · `lockId`

**出向外键** (2):
- `heroId` → `Hero`
- `skillId` → `fight/Skill`

### `RoguePVE/RogueSkillQuility`
- `id` · `skillQuility` · `skillTree`

### `RoguePVE/RogueTalent`
- `id` · `tId` · `lv` · `Icon` · `name` · `expend` · `unlockDay` · `initialExDrop`
- `bossExDrop` · `unlockSkillId` · `unlockSkillIds` · `heroId` · `property` · `info` · `lvUpInfo` · `lvUpShowSkill`

**出向外键** (1):
- `heroId` → `Hero`
