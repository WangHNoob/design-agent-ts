---
type: table_schema
title: "表族 Formation"
group: "Formation"
table_count: 3
---

# 表族 `Formation`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Formation` | 15 | Formation.xlsx |
| `FormationBackground` | 4 | FormationBackground.xlsx |
| `FormationPos` | 3 | FormationPos.xlsx |

## 字段明细
### `Formation`
- `formationId` · `formationName` · `openLevel` · `effectLevel` · `propAdd` · `type` · `defualtOpen` · `openCost`
- `desc` · `powerFactorD` · `FormationQuality` · `powerFactorB` · `powerFactorC` · `selfItem` · `selfPiece`

**入向外键** (6):
- `CelebrationPerson/CelebrationPersonNewTrialStage.formationId` → 本表
- `FormationPos.formationId` → 本表
- `_ArenaRobotHero.formationId` → 本表
- `heroAssist/FormationLev.formationId` → 本表
- `heroAssist/FormationLevClassic.formationId` → 本表
- `integral/_IntegralRobot.formationId` → 本表

### `FormationBackground`
- `id` · `bgImageRes` · `bgEffectResId` · `bgEffectPos`

### `FormationPos`
- `formationPosId` · `formationId` · `pos`

**出向外键** (1):
- `formationId` → `Formation`
