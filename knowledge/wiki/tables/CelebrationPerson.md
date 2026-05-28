---
type: table_schema
title: "表族 CelebrationPerson"
group: "CelebrationPerson"
table_count: 13
---

# 表族 `CelebrationPerson`

共 13 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `CelebrationPerson/CelebrationPersonGiftLimit` | 5 | CelebrationPerson/CelebrationPersonGiftLimit.xlsx |
| `CelebrationPerson/CelebrationPersonHeroTask` | 5 | CelebrationPerson/CelebrationPersonHeroTask.xlsx |
| `CelebrationPerson/CelebrationPersonNewTrialStage` | 14 | CelebrationPerson/CelebrationPersonNewTrialStage.xlsx |
| `CelebrationPerson/CelebrationPersonOpen` | 24 | CelebrationPerson/CelebrationPersonOpen.xlsx |
| `CelebrationPerson/CelebrationPersonPassLev` | 6 | CelebrationPerson/CelebrationPersonPassLev.xlsx |
| `CelebrationPerson/CelebrationPersonPassPay` | 15 | CelebrationPerson/CelebrationPersonPassPay.xlsx |
| `CelebrationPerson/CelebrationPersonPassTask` | 9 | CelebrationPerson/CelebrationPersonPassTask.xlsx |
| `CelebrationPerson/CelebrationPersonTrialHero` | 24 | CelebrationPerson/CelebrationPersonTrialHero.xlsx |
| `CelebrationPerson/CelebrationPersonTrialStage` | 14 | CelebrationPerson/CelebrationPersonTrialStage.xlsx |
| `CelebrationPerson/FightGuide` | 7 | CelebrationPerson/FightGuide.xlsx |
| `CelebrationPerson/_CelebrationPersonActivityOpen` | 3 | CelebrationPerson/_CelebrationPersonActivityOpen.xlsx |
| `CelebrationPerson/_CelebrationPersonPassTaskGroup` | 7 | CelebrationPerson/_CelebrationPersonPassTaskGroup.xlsx |
| `CelebrationPerson/_CelebrationPersonPassTaskSpeed` | 4 | CelebrationPerson/_CelebrationPersonPassTaskSpeed.xlsx |

## 字段明细
### `CelebrationPerson/CelebrationPersonGiftLimit`
- `giftId` · `limitStartTime` · `limitEndTime` · `discountText` · `maskText`

### `CelebrationPerson/CelebrationPersonHeroTask`
- `id` · `heroId` · `type` · `valNum` · `rewards`

**出向外键** (1):
- `heroId` → `Hero`

### `CelebrationPerson/CelebrationPersonNewTrialStage`
- `stageId` · `sort` · `enemy` · `scenes` · `forcedHero` · `canHero` · `formationId` · `rewards`
- `name` · `title` · `desc` · `forcedHeroDesc` · `bgImg` · `circleIcon`

**出向外键** (1):
- `formationId` → `Formation`

### `CelebrationPerson/CelebrationPersonOpen`
- `seasonId` · `mainTitle` · `mainBgImg` · `mainBgEffect` · `cardImg` · `cardJumpId` · `tryTitle` · `tryTitleImg`
- `battlePassTitle` · `battlePassTitleImg` · `giftMainTitle` · `giftTitle` · `giftBg` · `giftGroupId` · `bpBgImg` · `bpModel`
- `bgArtTxt` · `heroUPBg` · `heroUPTitleImg` · `heroUpDesc` · `UpdateTitle` · `tryTitle2` · `battlePassTitle2` · `shopid`

### `CelebrationPerson/CelebrationPersonPassLev`
- `level` · `desc` · `upLevelExp` · `reward` · `passReward` · `isSpecialReward`

### `CelebrationPerson/CelebrationPersonPassPay`
- `id` · `desc` · `paymentType` · `price` · `buyCost` · `isBuyRMB` · `reward` · `passLev`
- `isFirstBuy` · `secendBuyPreId` · `tipDayTime` · `bgImage` · `bpImage` · `titleImage` · `titleColor`

### `CelebrationPerson/CelebrationPersonPassTask`
- `taskId` · `taskType` · `taskTitle` · `taskDesc` · `taskTarget1` · `taskTarget2` · `addExp` · `taskReward`
- `targetId`

### `CelebrationPerson/CelebrationPersonTrialHero`
- `体验英雄ID` · `英雄ID` · `备注` · `皮肤` · `星级` · `等级` · `觉醒` · `主动技能`
- `生命` · `攻击` · `防御` · `速度` · `暴击` · `韧性` · `破击` · `格挡`
- `命中` · `闪避` · `暴伤` · `抗暴伤` · `抗全` · `格挡伤害` · `治疗暴击` · `特殊技能`

### `CelebrationPerson/CelebrationPersonTrialStage`
- `stageId` · `sort` · `name` · `enemy` · `scenes` · `forcedHero` · `forcedFormation` · `forcedPos`
- `rewards` · `title` · `desc` · `bgImg` · `guideId` · `circleIcon`

**出向外键** (1):
- `guideId` → `Guide/Guide`

### `CelebrationPerson/FightGuide`
- `id` · `group` · `step` · `trigger` · `index` · `guideEffect` · `guideText`

### `CelebrationPerson/_CelebrationPersonActivityOpen`
- `type` · `startTime` · `endTime`

### `CelebrationPerson/_CelebrationPersonPassTaskGroup`
- `id` · `isNewServer` · `taskGroupType` · `taskGroup` · `groupTitle` · `DAILY = 1;` · `//每日`

### `CelebrationPerson/_CelebrationPersonPassTaskSpeed`
- `id` · `startTime` · `endTime` · `speedPer`
