---
type: table_schema
title: "表族 _Equipment"
group: "_Equipment"
table_count: 2
---

# 表族 `_Equipment`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_EquipmentReIdentifyConfig` | 5 | _EquipmentReIdentifyConfig.xlsx |
| `_EquipmentScoreConfig` | 11 | _EquipmentScoreConfig.xlsx |

## 字段明细
### `_EquipmentReIdentifyConfig`
- `id` · `装备id` · `次数开始（闭区间）` · `次数结束（闭区间）` · `稀有保留概率(0-100)`

### `_EquipmentScoreConfig`
- `装备等级` · `主属性基础分` · `固定属性基础分` · `随机属性基础分` · `装备等级分` · `英雄装备属性基础分` · `普通装备属性分` · `套装分`
- `随机词条数分` · `打孔数分` · `稀有词条额外加的评分`
