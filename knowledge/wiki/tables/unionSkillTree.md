---
type: table_schema
title: "表族 unionSkillTree"
group: "unionSkillTree"
table_count: 4
---

# 表族 `unionSkillTree`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `unionSkillTree/UnionSkillTreeGroup` | 2 | unionSkillTree/UnionSkillTreeGroup.xlsx |
| `unionSkillTree/UnionSkillTreeOneSkill` | 8 | unionSkillTree/UnionSkillTreeOneSkill.xlsx |
| `unionSkillTree/UnionSkillTreeOneSkillLevel` | 5 | unionSkillTree/UnionSkillTreeOneSkillLevel.xlsx |
| `unionSkillTree/_UnionSkillTreeCondition` | 3 | unionSkillTree/_UnionSkillTreeCondition.xlsx |

## 字段明细
### `unionSkillTree/UnionSkillTreeGroup`
- `id` · `name`

### `unionSkillTree/UnionSkillTreeOneSkill`
- `id` · `unlockSkillId` · `position` · `groupId` · `name` · `icon` · `description` · `unlockDesc`

### `unionSkillTree/UnionSkillTreeOneSkillLevel`
- `id` · `skillId` · `level` · `upgradeCost` · `desc`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `unionSkillTree/_UnionSkillTreeCondition`
- `conditionId` · `type` · `valNum`
