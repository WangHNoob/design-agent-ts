---
type: table_schema
title: "表族 Exercise"
group: "Exercise"
table_count: 5
---

# 表族 `Exercise`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Exercise/ExerciseBigChapter` | 7 | Exercise/ExerciseBigChapter.xlsx |
| `Exercise/ExerciseHeroSkillType` | 2 | Exercise/ExerciseHeroSkillType.xlsx |
| `Exercise/ExerciseMidChapter` | 4 | Exercise/ExerciseMidChapter.xlsx |
| `Exercise/ExerciseSmallChapter` | 10 | Exercise/ExerciseSmallChapter.xlsx |
| `Exercise/ExerciseStarTask` | 2 | Exercise/ExerciseStarTask.xlsx |

## 字段明细
### `Exercise/ExerciseBigChapter`
- `id` · `formationType` · `heroSkillType` · `name` · `image` · `icon` · `desc`

### `Exercise/ExerciseHeroSkillType`
- `id` · `name`

### `Exercise/ExerciseMidChapter`
- `id` · `type` · `image` · `nearMidChapter`

### `Exercise/ExerciseSmallChapter`
- `id` · `image` · `reward` · `cost` · `rewardFirst` · `bigChapter` · `midChapter` · `starCondition`
- `title` · `explain`

### `Exercise/ExerciseStarTask`
- `star` · `reward`
