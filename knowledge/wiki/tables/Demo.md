---
type: table_schema
title: "表族 Demo"
group: "Demo"
table_count: 3
---

# 表族 `Demo`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `DemoEnemySailor` | 14 | DemoEnemySailor.xlsx |
| `DemoEnemySailorAI` | 4 | DemoEnemySailorAI.xlsx |
| `DemoSailor` | 14 | DemoSailor.xlsx |

## 字段明细
### `DemoEnemySailor`
- `id` · `SailorId` · `FpId` · `Hp` · `Anger` · `Atk` · `Def` · `Speed`
- `DefaultSkil` · `Skill1` · `Skill2` · `Skill3` · `PassiveSkill` · `UltimateSkill`

**入向外键** (1):
- `DemoEnemySailorAI.DemoEnemySailorId` → 本表

### `DemoEnemySailorAI`
- `id` · `DemoEnemySailorId` · `SkillId` · `Weight`

**出向外键** (2):
- `DemoEnemySailorId` → `DemoEnemySailor`
- `SkillId` → `fight/Skill`

### `DemoSailor`
- `id` · `SailorId` · `FpId` · `Hp` · `Anger` · `Atk` · `Def` · `Speed`
- `DefaultSkil` · `Skill1` · `Skill2` · `Skill3` · `PassiveSkill` · `UltimateSkill`
