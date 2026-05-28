---
type: table_schema
title: "表族 medal"
group: "medal"
table_count: 4
---

# 表族 `medal`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `medal/Medal` | 10 | medal/Medal.xlsx |
| `medal/MedalChat` | 28 | medal/MedalChat.xlsx |
| `medal/MedalMarquee` | 11 | medal/MedalMarquee.xlsx |
| `medal/MedalTitle` | 11 | medal/MedalTitle.xlsx |

## 字段明细
### `medal/Medal`
- `medalId` · `name` · `unlockCost` · `medalChatId` · `medalMarqueeId` · `medalTitleId` · `medalIcon` · `specialInfo`
- `desc` · `getInfo`

**出向外键** (3):
- `medalChatId` → `medal/MedalChat`
- `medalMarqueeId` → `medal/MedalMarquee`
- `medalTitleId` → `medal/MedalTitle`

**入向外键** (1):
- `recruit/PromoteMedalInfo.medalId` → 本表

### `medal/MedalChat`
- `medalChatId` · `name` · `unlockCost` · `bubbleIcon` · `chatIcon` · `chatIconEnemy` · `desc` · `getInfo`
- `chatColor` · `bubbleColor` · `effectID` · `previewEffectID` · `left` · `right` · `top` · `bottom`
- `oppositeLeft` · `oppositeRight` · `oppositeTop` · `oppositeBottom` · `leftTopSelf` · `rightTopSelf` · `leftBottomSelf` · `rightBottomSelf`
- `leftTopOpposite` · `rightTopOpposite` · `leftBottomOpposite` · `rightBottomOpposite`

**入向外键** (1):
- `medal/Medal.medalChatId` → 本表

### `medal/MedalMarquee`
- `medalMarqueeId` · `name` · `unlockCost` · `pushMessage` · `leftIcon` · `rightIcon` · `desc` · `getInfo`
- `textColor` · `effectId` · `mainUiResource`

**入向外键** (1):
- `medal/Medal.medalMarqueeId` → 本表

### `medal/MedalTitle`
- `medalTitleId` · `name` · `unlockCost` · `playerTitleIcon` · `desc` · `getInfo` · `effectId` · `previewEffectID`
- `reduceRate` · `dynamicPic` · `dynamicPath`

**入向外键** (1):
- `medal/Medal.medalTitleId` → 本表
