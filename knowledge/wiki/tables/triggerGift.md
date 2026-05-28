---
type: table_schema
title: "表族 triggerGift"
group: "triggerGift"
table_count: 2
---

# 表族 `triggerGift`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `triggerGift/NewTriggerGift` | 4 | triggerGift/NewTriggerGift.xlsx |
| `triggerGift/NewTriggerGiftGroup` | 19 | triggerGift/NewTriggerGiftGroup.xlsx |

## 字段明细
### `triggerGift/NewTriggerGift`
- `id` · `rewards` · `price` · `discounts`

### `triggerGift/NewTriggerGiftGroup`
- `groupId` · `档位` · `触发类型` · `玩家等级限制` · `彩钻数校验,彩钻超过这个数，就无法触发` · `条件额外参数(有的要填装备和英雄Id)` · `礼包数据giftId,giftId,giftId...` · `默认cd(分钟)`
- `全部购买的cd(分钟)` · `2次没有购买的cd(分钟)` · `持续时间(分钟)` · `礼包名字` · `标题图片资源` · `大背景图` · `背景特效` · `价格底图`
- `開始時間` · `結束時間` · `升檔禮包id`
