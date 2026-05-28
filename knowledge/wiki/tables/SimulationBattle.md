---
type: table_schema
title: "表族 SimulationBattle"
group: "SimulationBattle"
table_count: 3
---

# 表族 `SimulationBattle`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SimulationBattle/SimulationBattleFightHeroSkill` | 3 | SimulationBattle/SimulationBattleFightHeroSkill.xlsx |
| `SimulationBattle/SimulationBattleFightPosition` | 6 | SimulationBattle/SimulationBattleFightPosition.xlsx |
| `SimulationBattle/SimulationBattleFightRelease` | 3 | SimulationBattle/SimulationBattleFightRelease.xlsx |

## 字段明细
### `SimulationBattle/SimulationBattleFightHeroSkill`
- `id` · `heroId` · `skillId`

**出向外键** (2):
- `heroId` → `Hero`
- `skillId` → `fight/Skill`

### `SimulationBattle/SimulationBattleFightPosition`
- `posId` · `position` · `rotation` · `fightPosOffset` · `particleOffset` · `group`

### `SimulationBattle/SimulationBattleFightRelease`
- `ReleaseId` · `ReleaseWeight` · `SkillName`
