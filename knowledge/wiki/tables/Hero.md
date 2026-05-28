---
type: table_schema
title: "表族 Hero"
group: "Hero"
table_count: 24
---

# 表族 `Hero`

共 24 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Hero` | 54 | Hero.xlsx |
| `HeroActionPictorial` | 15 | HeroActionPictorial.xlsx |
| `HeroBreach` | 22 | HeroBreach.xlsx |
| `HeroExpeditionSkills` | 2 | HeroExpeditionSkills.xlsx |
| `HeroExtrarProperty` | 3 | HeroExtrarProperty.xlsx |
| `HeroFashion` | 27 | HeroFashion.xlsx |
| `HeroFastLevelUp` | 4 | HeroFastLevelUp.xlsx |
| `HeroFinalTrain` | 4 | HeroFinalTrain.xlsx |
| `HeroFormationBackGround` | 3 | HeroFormationBackGround.xlsx |
| `HeroGroup` | 3 | HeroGroup.xlsx |
| `HeroLevel` | 4 | HeroLevel.xlsx |
| `HeroModelDisplayOffset` | 24 | HeroModelDisplayOffset.xlsx |
| `HeroPictrue` | 4 | HeroPictrue.xlsx |
| `HeroPictruePos` | 7 | HeroPictruePos.xlsx |
| `HeroSceneAction` | 21 | HeroSceneAction.xlsx |
| `HeroSectProp` | 4 | HeroSectProp.xlsx |
| `HeroSoulCard` | 7 | HeroSoulCard.xlsx |
| `HeroSpecialSceneAction` | 6 | HeroSpecialSceneAction.xlsx |
| `HeroStarExtraAddProp` | 4 | HeroStarExtraAddProp.xlsx |
| `HeroStarGrowth` | 24 | HeroStarGrowth.xlsx |
| `HeroTrain` | 20 | HeroTrain.xlsx |
| `HeroUpgradeExpItemRule` | 3 | HeroUpgradeExpItemRule.xlsx |
| `HeroUpgradeIntimacyItemRule` | 3 | HeroUpgradeIntimacyItemRule.xlsx |
| `HeroUpgradeWeight` | 3 | HeroUpgradeWeight.xlsx |

## 字段明细
### `Hero`
- `heroId` · `sourceHeroId` · `heroName` · `gender` · `heroDesc` · `heroFeature` · `heroStyle` · `heroAttackTarget`
- `heroAbility` · `skillsIntroduction` · `isHero` · `heroInManual` · `heroType` · `expedtionSkills` · `heroGroupId` · `heroBossTitle`
- `defaultStar` · `maxStar` · `quality` · `modelId` · `heroPaint` · `recruitPoint` · `fragItemId` · `soulItemId`
- `soulExchangeFragNum` · `fragNeedNum` · `diposeFragNum` · `atk` · `def` · `hp` · `speed` · `cri`
- `anticri` · `hit` · `dodge` · `attributeBase` · `winSound` · `enterSound` · `formationOnSound` · `normalSound`
- `ModelParticleStarLimit` · `heroGraph` · `heroPosition` · `heroActor` · `introSkillId` · `extraHeroGroups` · `definitionType` · `arrayHeroType`
- `cardOrderId` · `medalItemId` · `medalItemNum` · `heroSkillType` · `sourceHeroIds` · `SkillBookMax`

**出向外键** (1):
- `heroGroupId` → `HeroGroup`

**入向外键** (76):
- `CelebrationPerson/CelebrationPersonHeroTask.heroId` → 本表
- `DemoHero/DemoHeroPropOffset.heroId` → 本表
- `DemoHero/_DemoHeroConfig.heroId` → 本表
- `FightManeuver/FightManeuver.heroId` → 本表
- `Haki/HakiHero.heroId` → 本表
- `Haki/HakiTask.heroId` → 本表
- `Haki/HakiTaskReward.heroId` → 本表
- `HelpPower/HelpPower.heroId` → 本表
- `HelpPower/HelpPowerHero.heroId` → 本表
- `HelpPower/HelpPowerUnlock.heroId` → 本表
- … 其余 66 条见 `_tables/table_fk_registry.json`

### `HeroActionPictorial`
- `id` · `heroId` · `actionPictorialName` · `unlockType` · `cost` · `isDefault` · `validTime` · `num`
- `actionPictorialTitle` · `actionPictorialDesc` · `options` · `FeatureEffectIdAdd` · `enterSound` · `specialShowType` · `sort`

**出向外键** (1):
- `heroId` → `Hero`

### `HeroBreach`
- `HeroBreachId` · `HeroId` · `BreachLevel` · `passiveLimit` · `BreachCost` · `atk` · `def` · `hp`
- `speed` · `cri` · `anticri` · `hit` · `dodge` · `attributeAddProp` · `defEvaluate` · `hpEvaluate`
- `speedEvaluate` · `criEvaluate` · `anticriEvaluate` · `hitEvaluate` · `dodgeEvaluate` · `atkEvaluate`

**出向外键** (1):
- `HeroId` → `Hero`

### `HeroExpeditionSkills`
- `id` · `name`

### `HeroExtrarProperty`
- `id` · `propertyId` · `propertyName`

### `HeroFashion`
- `fashionId` · `heroId` · `isDefault` · `isHide` · `specialShowType` · `specialShowArgs` · `sort` · `propAdd`
- `fightBuffIds` · `unlockType` · `cost` · `icon` · `fashionName` · `modelId` · `fashionDesc` · `winSound`
- `enterSound` · `formationOnSound` · `petIds` · `mountId` · `formationBgId` · `powerFactorB` · `powerFactorC` · `powerFactorD`
- `transAniAndAudio` · `switchText` · `fightingInvalid`

**出向外键** (2):
- `heroId` → `Hero`
- `fightBuffIds` → `fight/FightBuff`

**入向外键** (5):
- `BeastPirates/BeastPiratesFourStageBoss.heroFashionId` → 本表
- `BeastPirates/BeastPiratesStrongholdBoss.heroFashionId` → 本表
- `BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaid.heroFashionId` → 本表
- `MysteryShop/MysteryShopTime.heroFashionId` → 本表
- `ServerChallenge/Overlord/OverlordBoss.heroFashionId` → 本表

### `HeroFastLevelUp`
- `id` · `duration` · `interval` · `number`

### `HeroFinalTrain`
- `id` · `trainType` · `trainLevel` · `costItems`

### `HeroFormationBackGround`
- `id` · `heroId` · `backGround`

**出向外键** (1):
- `heroId` → `Hero`

### `HeroGroup`
- `heroGroupId` · `GroupName` · `parentGroupId`

**入向外键** (4):
- `HelpPower/HelpPower.heroGroupId` → 本表
- `Hero.heroGroupId` → 本表
- `URRecruit/URRecruitHeroPreview.heroGroupId` → 本表
- `heroAwake/HeroAwakeOpen.heroGroupId` → 本表

### `HeroLevel`
- `id` · `level` · `exp` · `factor`

### `HeroModelDisplayOffset`
- `ModelId` · `ScaleOffset` · `ScaleOffsetForTrain` · `heroFormationPosOffset` · `heroFormationPosScale` · `LadderPosOffset` · `LadderPosScale` · `CompetitionPosOffset`
- `CompetitionScale` · `FashionOffset` · `FashionScale` · `WinnerScale` · `WinnerTitlePosOffset` · `heroTurnPosOffset` · `heroTurnPosScale` · `heroTurnAngle`
- `soulCardOffset` · `soulCardOffsetScale` · `PersonCarnivalBpOffset` · `PersonCarnivalBpScale` · `formationArrayScale` · `formationArrayMSBlackList` · `SPRecruitOffset` · `SPRecruitScale`

### `HeroPictrue`
- `pictrueId` · `pictrueName` · `pagename` · `posIds`

### `HeroPictruePos`
- `id` · `heroId` · `page` · `heroPos` · `heroScale` · `heroPath` · `picturelevel`

**出向外键** (1):
- `heroId` → `Hero`

### `HeroSceneAction`
- `id` · `animName` · `animIcon` · `animText` · `sound` · `soundDelay` · `effect` · `showInEmoji`
- `showInScene` · `showInFormation` · `lines` · `linesOffset` · `linesDuration` · `modelId` · `showInFashion` · `showInEquipLuckDraw`
- `showInRide` · `triggerCondition` · `showPersonalityModel` · `animIcon` · `animText`

### `HeroSectProp`
- `sectId` · `sectName` · `limitSkillAddItem` · `awakeLimitSkillAddItem`

### `HeroSoulCard`
- `Id` · `propType` · `quality` · `powerFactorD` · `icon` · `powerFactorB` · `powerFactorC`

### `HeroSpecialSceneAction`
- `id` · `modelId` · `specialAreaType` · `commonEffectId01` · `commonEffectId02` · `commonEffectId03`

### `HeroStarExtraAddProp`
- `id` · `heroId` · `star` · `addProp`

**出向外键** (1):
- `heroId` → `Hero`

### `HeroStarGrowth`
- `id` · `heroId` · `starNum` · `cost` · `soulNum` · `levelLimit` · `atk` · `def`
- `hp` · `speed` · `cri` · `anticri` · `hit` · `dodge` · `attributeGrowth` · `attributeAddition`
- `atkEvaluate` · `defEvaluate` · `hpEvaluate` · `speedEvaluate` · `criEvaluate` · `anticriEvaluate` · `hitEvaluate` · `dodgeEvaluate`

**出向外键** (1):
- `heroId` → `Hero`

### `HeroTrain`
- `训练id` · `训练类型` · `训练等级` · `训练随机参数` · `训练到最高级最少次数` · `训练到最高级最大次数` · `消耗物品` · `属性加成`
- `训练大师加成` · `EmptyKey-J2` · `EmptyKey-K2` · `EmptyKey-L2` · `EmptyKey-M2` · `EmptyKey-N2` · `EmptyKey-O2` · `EmptyKey-P2`
- `EmptyKey-Q2` · `EmptyKey-R2` · `EmptyKey-S2` · `EmptyKey-T2`

### `HeroUpgradeExpItemRule`
- `id` · `level` · `rule`

### `HeroUpgradeIntimacyItemRule`
- `id` · `level` · `rule`

### `HeroUpgradeWeight`
- `id` · `level` · `itemOrder`
