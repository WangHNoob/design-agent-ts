---
type: table_schema
title: "表族 partner"
group: "partner"
table_count: 3
---

# 表族 `partner`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `partner/PartnerLevel` | 8 | partner/PartnerLevel.xlsx |
| `partner/PartnerTask` | 14 | partner/PartnerTask.xlsx |
| `partner/_PartnerBuff` | 4 | partner/_PartnerBuff.xlsx |

## 字段明细
### `partner/PartnerLevel`
- `level` · `upgradeExp` · `describeSimple` · `describeComplex` · `tacitLimit` · `maxQuality` · `rewardType` · `rewards`

### `partner/PartnerTask`
- `id` · `type` · `conditionType` · `num` · `conditionParam` · `reward` · `tacit` · `exp`
- `description` · `title` · `icon` · `rank` · `goToType` · `clientAward`

### `partner/_PartnerBuff`
- `buffId` · `buffType` · `param` · `说明`

**出向外键** (1):
- `buffId` → `fight/_Buff`
