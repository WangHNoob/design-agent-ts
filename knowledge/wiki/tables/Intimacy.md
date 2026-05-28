---
type: table_schema
title: "表族 Intimacy"
group: "Intimacy"
table_count: 5
---

# 表族 `Intimacy`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Intimacy/IntimacyChapter` | 11 | Intimacy/IntimacyChapter.xlsx |
| `Intimacy/IntimacyIcon` | 6 | Intimacy/IntimacyIcon.xlsx |
| `Intimacy/IntimacyReward` | 7 | Intimacy/IntimacyReward.xlsx |
| `Intimacy/IntimacyUnit` | 8 | Intimacy/IntimacyUnit.xlsx |
| `Intimacy/_IntimacyHero(废弃)` | 7 | Intimacy/_IntimacyHero(废弃).xlsx |

## 字段明细
### `Intimacy/IntimacyChapter`
- `chapterId` · `chapterHero` · `chapterShip` · `chapterShow` · `chapterName` · `chapterIntro` · `chapterReward` · `chapterText`
- `addPropValue` · `addPropPercent` · `sort`

### `Intimacy/IntimacyIcon`
- `id` · `activeType` · `target` · `icon` · `iconName` · `rank`

### `Intimacy/IntimacyReward`
- `barId` · `activeNum` · `rewardName` · `property` · `propertyPercent` · `buff` · `desc`

### `Intimacy/IntimacyUnit`
- `id` · `unitType` · `unitId` · `activeType` · `target` · `activeNum` · `addPropValue` · `addPropPercent`

### `Intimacy/_IntimacyHero(废弃)`
- `heroId` · `heroName` · `barNum` · `starReward` · `breakReward` · `levelReward` · `promotionReward`

**出向外键** (1):
- `heroId` → `Hero`
