---
type: table_schema
title: "表族 heroAwake"
group: "heroAwake"
table_count: 8
---

# 表族 `heroAwake`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `heroAwake/HeroAwake` | 14 | heroAwake/HeroAwake.xlsx |
| `heroAwake/HeroAwakeExtraSkill` | 6 | heroAwake/HeroAwakeExtraSkill.xlsx |
| `heroAwake/HeroAwakeExtraSkillConditionDesc` | 2 | heroAwake/HeroAwakeExtraSkillConditionDesc.xlsx |
| `heroAwake/HeroAwakeExtraSkillLev` | 6 | heroAwake/HeroAwakeExtraSkillLev.xlsx |
| `heroAwake/HeroAwakeLevel` | 3 | heroAwake/HeroAwakeLevel.xlsx |
| `heroAwake/HeroAwakeOpen` | 12 | heroAwake/HeroAwakeOpen.xlsx |
| `heroAwake/HeroAwakeUnlock` | 9 | heroAwake/HeroAwakeUnlock.xlsx |
| `heroAwake/_HeroCoopSkill` | 4 | heroAwake/_HeroCoopSkill.xlsx |

## 字段明细
### `heroAwake/HeroAwake`
- `id` · `heroId` · `awakeLevel` · `cost` · `star` · `propNum` · `angerUpper` · `atk`
- `def` · `hp` · `instro` · `skillId` · `powerFactorB` · `powerFactorD`

**出向外键** (2):
- `heroId` → `Hero`
- `skillId` → `fight/Skill`

### `heroAwake/HeroAwakeExtraSkill`
- `id` · `heroId` · `skillId` · `skillLevMax` · `skillName` · `skillIIcon`

**出向外键** (2):
- `heroId` → `Hero`
- `skillId` → `fight/Skill`

### `heroAwake/HeroAwakeExtraSkillConditionDesc`
- `id` · `conditionDesc`

### `heroAwake/HeroAwakeExtraSkillLev`
- `id` · `skillLev` · `skillId` · `cost` · `unlockCondition` · `skillIntro`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `heroAwake/HeroAwakeLevel`
- `awakeLevel` · `icon` · `name`

### `heroAwake/HeroAwakeOpen`
- `id` · `heroId` · `heroLeftGraph` · `heroRightGraph` · `heroStyle` · `heroAttackTarget` · `heroAbility` · `heroGroupId`
- `propInstro` · `skillImproveIntro` · `skillAddIntro` · `cost`

**出向外键** (2):
- `heroId` → `Hero`
- `heroGroupId` → `HeroGroup`

### `heroAwake/HeroAwakeUnlock`
- `heroId` · `isUnlock` · `unlockLev` · `unlockBreak` · `unlockStar` · `unlockFashionId` · `skillInstro` · `unlockText`
- `actionId`

**出向外键** (1):
- `heroId` → `Hero`

### `heroAwake/_HeroCoopSkill`
- `7` · `1` · `9999` · `3`
