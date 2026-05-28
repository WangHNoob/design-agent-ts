---
type: table_schema
title: "表族 FormationPass"
group: "FormationPass"
table_count: 3
---

# 表族 `FormationPass`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `FormationPass/FormationPassActive` | 3 | FormationPass/FormationPassActive.xlsx |
| `FormationPass/FormationPassLevel` | 2 | FormationPass/FormationPassLevel.xlsx |
| `FormationPass/FormationPassTask` | 9 | FormationPass/FormationPassTask.xlsx |

## 字段明细
### `FormationPass/FormationPassActive`
- `id` · `needExp` · `award`

### `FormationPass/FormationPassLevel`
- `Level` · `NewLevel`

### `FormationPass/FormationPassTask`
- `id` · `taskType` · `descr` · `type` · `needTimes` · `active` · `texture` · `desc`
- `targetId`
