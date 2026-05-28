---
type: table_schema
title: "表族 newRedPacket"
group: "newRedPacket"
table_count: 4
---

# 表族 `newRedPacket`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `newRedPacket/NewRedPacket` | 12 | newRedPacket/NewRedPacket.xlsx |
| `newRedPacket/RedPacketCelebrationChallengeItem` | 8 | newRedPacket/RedPacketCelebrationChallengeItem.xlsx |
| `newRedPacket/RedPacketPaymentNum` | 4 | newRedPacket/RedPacketPaymentNum.xlsx |
| `newRedPacket/_NewRedPacketItem` | 9 | newRedPacket/_NewRedPacketItem.xlsx |

## 字段明细
### `newRedPacket/NewRedPacket`
- `redPacketId` · `redPacketType` · `redPacketName` · `redPacketItemType` · `maxNum` · `maxPerson` · `minMoney` · `maxMoney`
- `isRandom` · `validHour` · `blessing` · `redPacketIcon`

### `newRedPacket/RedPacketCelebrationChallengeItem`
- `id` · `chapterId` · `isDiff` · `redPacketId` · `redPacketItem` · `probability` · `times` · `maxNum`

### `newRedPacket/RedPacketPaymentNum`
- `id` · `giftId` · `num` · `redPacketId`

### `newRedPacket/_NewRedPacketItem`
- `redPacketId` · `redPacketType` · `redPacketItem` · `maxNum` · `maxPerson` · `minMoney` · `maxMoney` · `isRandom`
- `validHour`
