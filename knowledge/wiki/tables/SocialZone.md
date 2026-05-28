---
type: table_schema
title: "表族 SocialZone"
group: "SocialZone"
table_count: 1
---

# 表族 `SocialZone`

共 1 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SocialZone/SendFlower` | 6 | SocialZone/SendFlower.xlsx |

## 字段明细
### `SocialZone/SendFlower`
- `id` · `itemid` · `addGlamouNum` · `sexCondition` · `addFriendness` · `noticeId`

**出向外键** (1):
- `itemid` → `Item`
