---
type: table_schema
title: "表族 crawlTower"
group: "crawlTower"
table_count: 3
---

# 表族 `crawlTower`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `crawlTower/CrawlTowerChapter` | 10 | crawlTower/CrawlTowerChapter.xlsx |
| `crawlTower/CrawlTowerPassReward` | 5 | crawlTower/CrawlTowerPassReward.xlsx |
| `crawlTower/CrawlTowerWeekTask` | 4 | crawlTower/CrawlTowerWeekTask.xlsx |

## 字段明细
### `crawlTower/CrawlTowerChapter`
- `chapterId` · `distanceX` · `posY` · `chapterDesc` · `chapterIcon` · `reward` · `recFightPower` · `chapterBk`
- `firstReward` · `playerLevLimit`

### `crawlTower/CrawlTowerPassReward`
- `rewardId` · `desc` · `target` · `reward` · `passReward`

### `crawlTower/CrawlTowerWeekTask`
- `taskId` · `taskDesc` · `taskTarget` · `reward`
