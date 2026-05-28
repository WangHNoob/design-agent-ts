---
type: table_schema
title: "表族 puzzle"
group: "puzzle"
table_count: 6
---

# 表族 `puzzle`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `puzzle/PuzzleChapter` | 2 | puzzle/PuzzleChapter.xlsx |
| `puzzle/PuzzleFragment` | 8 | puzzle/PuzzleFragment.xlsx |
| `puzzle/PuzzleReward` | 5 | puzzle/PuzzleReward.xlsx |
| `puzzle/PuzzleTask` | 8 | puzzle/PuzzleTask.xlsx |
| `puzzle/_PuzzleFragProb` | 4 | puzzle/_PuzzleFragProb.xlsx |
| `puzzle/_PuzzleFragProbGroup` | 4 | puzzle/_PuzzleFragProbGroup.xlsx |

## 字段明细
### `puzzle/PuzzleChapter`
- `chapterId` · `passReward`

### `puzzle/PuzzleFragment`
- `id` · `chapterId` · `row` · `col` · `resUrl` · `pieceCodeUrl` · `pieceBgUrl` · `pieceWuBgUrl`

### `puzzle/PuzzleReward`
- `id` · `chapterId` · `type` · `num` · `reward`

### `puzzle/PuzzleTask`
- `id` · `type` · `num` · `reward` · `fragNum` · `anyFragNum` · `description` · `title`

### `puzzle/_PuzzleFragProb`
- `id` · `位置（从0开始）` · `权重` · `组`

### `puzzle/_PuzzleFragProbGroup`
- `id` · `开始时间` · `结束时间` · `组`
