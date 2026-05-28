---
type: table_schema
title: "表族 heroPromote"
group: "heroPromote"
table_count: 2
---

# 表族 `heroPromote`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `heroPromote/HeroPromote` | 12 | heroPromote/HeroPromote.xlsx |
| `heroPromote/promoteUI` | 9 | heroPromote/promoteUI.xlsx |

## 字段明细
### `heroPromote/HeroPromote`
- `id` · `heroId` · `promotionLevel` · `cost` · `extraFightPower` · `apUpper` · `angerUpper` · `positiveSkillImprove`
- `passiveSkillImprove` · `skillBookUpper` · `openSuperUltimate` · `audio`

**出向外键** (1):
- `heroId` → `Hero`

### `heroPromote/promoteUI`
- `promotionLevel` · `promoteIcon` · `promoteName` · `promoteDes` · `propUp` · `promoteNameNO` · `promoteDesNO` · `propUpNO`
- `promoteSummary`
