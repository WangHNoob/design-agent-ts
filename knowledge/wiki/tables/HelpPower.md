---
type: table_schema
title: "表族 HelpPower"
group: "HelpPower"
table_count: 5
---

# 表族 `HelpPower`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `HelpPower/HelpPower` | 15 | HelpPower/HelpPower.xlsx |
| `HelpPower/HelpPowerHero` | 4 | HelpPower/HelpPowerHero.xlsx |
| `HelpPower/HelpPowerUnlock` | 6 | HelpPower/HelpPowerUnlock.xlsx |
| `HelpPower/HelpPowerUp` | 4 | HelpPower/HelpPowerUp.xlsx |
| `HelpPower/_HeroCheer` | 11 | HelpPower/_HeroCheer.xlsx |

## 字段明细
### `HelpPower/HelpPower`
- `id` · `heroId` · `unlockLev` · `unlockBreak` · `unlockStar` · `heroAbility` · `heroGroupId` · `propInstro`
- `heroHelpName` · `HelpheroId` · `skillImproveIntro` · `skillAddIntro` · `cost` · `powerFactorB` · `powerFactorD`

**出向外键** (2):
- `heroId` → `Hero`
- `heroGroupId` → `HeroGroup`

### `HelpPower/HelpPowerHero`
- `id` · `TargetheroId` · `heroId` · `UpId`

**出向外键** (1):
- `heroId` → `Hero`

### `HelpPower/HelpPowerUnlock`
- `heroId` · `heroName` · `heroNameColorUp` · `heroNameColorDown` · `skillInstro` · `heroScale`

**出向外键** (1):
- `heroId` → `Hero`

### `HelpPower/HelpPowerUp`
- `id` · `type` · `targetNum` · `buffTxt`

### `HelpPower/_HeroCheer`
- `自增id` · `助威目标英雄id` · `助威英雄id` · `需要等级` · `需要星级` · `需要突破` · `需要觉醒等级` · `拥有指定皮肤`
- `拥有指定船只` · `Buff` · `Buff2`
