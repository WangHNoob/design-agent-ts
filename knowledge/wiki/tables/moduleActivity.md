---
type: table_schema
title: "表族 moduleActivity"
group: "moduleActivity"
table_count: 10
---

# 表族 `moduleActivity`

共 10 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `moduleActivity/Liveness/TimeLimitedLivenessActivity` | 24 | moduleActivity/Liveness/TimeLimitedLivenessActivity.xlsx |
| `moduleActivity/Liveness/TimeLimitedLivenessContentConfig` | 4 | moduleActivity/Liveness/TimeLimitedLivenessContentConfig.xlsx |
| `moduleActivity/QAgame` | 8 | moduleActivity/QAgame.xlsx |
| `moduleActivity/RoleCheck` | 6 | moduleActivity/RoleCheck.xlsx |
| `moduleActivity/_moduleActivityType` | 3 | moduleActivity/_moduleActivityType.xlsx |
| `moduleActivity/trialStage/trialEnemyInfo` | 5 | moduleActivity/trialStage/trialEnemyInfo.xlsx |
| `moduleActivity/trialStage/trialHero` | 25 | moduleActivity/trialStage/trialHero.xlsx |
| `moduleActivity/trialStage/trialHero2D` | 5 | moduleActivity/trialStage/trialHero2D.xlsx |
| `moduleActivity/trialStage/trialReward` | 6 | moduleActivity/trialStage/trialReward.xlsx |
| `moduleActivity/trialStage/trialStage` | 18 | moduleActivity/trialStage/trialStage.xlsx |

## 字段明细
### `moduleActivity/Liveness/TimeLimitedLivenessActivity`
- `ID` · `StageID` · `ContentID` · `Switch` · `StageProgress` · `Reward` · `ItemID` · `ItemCost`
- `ProgressPromotionNormal` · `ProgressPromotionCritical` · `CriticalChance` · `ForegroundImage` · `BackgroundImage` · `ProgressBarBackgorund` · `ProgressBarFill` · `ProgresIcon`
- `ExchangeBtnTextNormal` · `ExchangeBtnImageNormal` · `ExchangeBtnTextDone` · `ExchangeBtnImageDone` · `ExchangeBtnPos` · `SwitchBtnParam` · `ProgressDescriptionText` · `Expand`

**出向外键** (1):
- `ItemID` → `Item`

### `moduleActivity/Liveness/TimeLimitedLivenessContentConfig`
- `ContentID` · `MaxLivenessSet` · `EntranceImage` · `Extra`

### `moduleActivity/QAgame`
- `questionId` · `type` · `textureType` · `questionText` · `answerText` · `answerValue` · `yesReward` · `noReward`

### `moduleActivity/RoleCheck`
- `id` · `rewards` · `maxSlider` · `desc` · `tabType` · `tabName`

### `moduleActivity/_moduleActivityType`
- `activityType` · `curConfig` · `intro`

### `moduleActivity/trialStage/trialEnemyInfo`
- `id` · `技能描述` · `备注` · `技能名称` · `技能图标`

### `moduleActivity/trialStage/trialHero`
- `体验英雄ID` · `英雄ID` · `备注` · `皮肤` · `星级` · `等级` · `觉醒` · `主动技能`
- `生命` · `攻击` · `防御` · `速度` · `暴击` · `韧性` · `破击` · `格挡`
- `命中` · `闪避` · `暴伤` · `抗暴伤` · `抗全` · `格挡伤害` · `治疗暴击` · `特殊技能`
- `新服开放`

### `moduleActivity/trialStage/trialHero2D`
- `Index` · `heroPath` · `heroPos` · `heroScaleX` · `heroScaleY`

### `moduleActivity/trialStage/trialReward`
- `rewardId` · `sort` · `indexId` · `unlockCondition` · `conditionText` · `reward`

### `moduleActivity/trialStage/trialStage`
- `stageId` · `sort` · `indexStage` · `button` · `name` · `text` · `image` · `unlockCondition`
- `conditionText` · `forcedHero` · `forcedFormation` · `forcedPos` · `heroPool` · `enemy` · `scenes` · `selfDetails`
- `enemyDetails` · `forcedAuto`
