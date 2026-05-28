---
type: table_schema
title: "表族 fight"
group: "fight"
table_count: 52
---

# 表族 `fight`

共 52 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `fight/BossInfo` | 6 | fight/BossInfo.xlsx |
| `fight/BossSkillInfo` | 5 | fight/BossSkillInfo.xlsx |
| `fight/BuffActive` | 9 | fight/BuffActive.xlsx |
| `fight/BuffGroupRule` | 10 | fight/BuffGroupRule.xlsx |
| `fight/BuffOdds` | 6 | fight/BuffOdds.xlsx |
| `fight/BuffView` | 77 | fight/BuffView.xlsx |
| `fight/BuffViewFashionExt` | 9 | fight/BuffViewFashionExt.xlsx |
| `fight/BuffViewGlobal` | 10 | fight/BuffViewGlobal.xlsx |
| `fight/BuffViewParticleSetting` | 3 | fight/BuffViewParticleSetting.xlsx |
| `fight/BuffViewSummon` | 17 | fight/BuffViewSummon.xlsx |
| `fight/ComboDamage` | 3 | fight/ComboDamage.xlsx |
| `fight/CommonMaterial` | 2 | fight/CommonMaterial.xlsx |
| `fight/ExceptNormalParticle` | 2 | fight/ExceptNormalParticle.xlsx |
| `fight/FeatureEffect` | 10 | fight/FeatureEffect.xlsx |
| `fight/FieldEffectFilter` | 4 | fight/FieldEffectFilter.xlsx |
| `fight/FightBuff` | 9 | fight/FightBuff.xlsx |
| `fight/FightReportBuffDesc` | 5 | fight/FightReportBuffDesc.xlsx |
| `fight/FightReportConfig` | 4 | fight/FightReportConfig.xlsx |
| `fight/FightSkipDeclare` | 10 | fight/FightSkipDeclare.xlsx |
| `fight/HeroSelecltRule` | 2 | fight/HeroSelecltRule.xlsx |
| `fight/Particle` | 4 | fight/Particle.xlsx |
| `fight/SailorEffectHide` | 3 | fight/SailorEffectHide.xlsx |
| `fight/SailorModel` | 48 | fight/SailorModel.xlsx |
| `fight/SailorModelAnimation` | 13 | fight/SailorModelAnimation.xlsx |
| `fight/SailorModelAudio` | 4 | fight/SailorModelAudio.xlsx |
| `fight/SailorModelOffset` | 5 | fight/SailorModelOffset.xlsx |
| `fight/SailorModelSkin` | 5 | fight/SailorModelSkin.xlsx |
| `fight/SailorModelSkinTrans` | 12 | fight/SailorModelSkinTrans.xlsx |
| `fight/SailorModelTrans` | 9 | fight/SailorModelTrans.xlsx |
| `fight/SailorSkill` | 49 | fight/SailorSkill.xlsx |
| `fight/SailorSkillAdvance` | 3 | fight/SailorSkillAdvance.xlsx |
| `fight/SailorSkillAnimation` | 6 | fight/SailorSkillAnimation.xlsx |
| `fight/SailorSkillExt` | 7 | fight/SailorSkillExt.xlsx |
| `fight/SailorSkillGroup` | 5 | fight/SailorSkillGroup.xlsx |
| `fight/SailorSkillRelease` | 37 | fight/SailorSkillRelease.xlsx |
| `fight/SailorSkillReleaseHitStop` | 6 | fight/SailorSkillReleaseHitStop.xlsx |
| `fight/SailorSkillSceneHide` | 5 | fight/SailorSkillSceneHide.xlsx |
| `fight/SailorUltimateSkillHideLogic` | 7 | fight/SailorUltimateSkillHideLogic.xlsx |
| `fight/Skill` | 54 | fight/Skill.xlsx |
| `fight/SkillJointAttack` | 5 | fight/SkillJointAttack.xlsx |
| `fight/SkillLevelStep` | 3 | fight/SkillLevelStep.xlsx |
| `fight/SkillLevelupCost` | 19 | fight/SkillLevelupCost.xlsx |
| `fight/SkillLevelupDamage` | 13 | fight/SkillLevelupDamage.xlsx |
| `fight/SkillLevelupUnlock` | 5 | fight/SkillLevelupUnlock.xlsx |
| `fight/SkillLine` | 9 | fight/SkillLine.xlsx |
| `fight/SkillLineCorner` | 7 | fight/SkillLineCorner.xlsx |
| `fight/SkillSpecialConfig` | 2 | fight/SkillSpecialConfig.xlsx |
| `fight/_BattleResultType` | 10 | fight/_BattleResultType.xlsx |
| `fight/_Buff` | 20 | fight/_Buff.xlsx |
| `fight/_BuffCondition` | 5 | fight/_BuffCondition.xlsx |
| `fight/_FightPropLimit` | 6 | fight/_FightPropLimit.xlsx |
| `fight/_SkillExtraFightPower` | 4 | fight/_SkillExtraFightPower.xlsx |

## 字段明细
### `fight/BossInfo`
- `BossId` · `BossIcon` · `BossName` · `BossTitle` · `BossDesc` · `BossSkillIndex`

**入向外键** (1):
- `explore/ExploreBoss.BossInfoId` → 本表

### `fight/BossSkillInfo`
- `BossSkillId` · `SkillIndex` · `SkillName` · `SkillIcon` · `SkillDesc`

**入向外键** (1):
- `teamBoss/TeamBossBuff.bossSkillInfoId` → 本表

### `fight/BuffActive`
- `id` · `buffId` · `grade` · `buffParam1` · `buffParam1Levelup` · `buffParam2` · `buffParam2Levelup` · `buffParam3`
- `buffParam3Levelup`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `fight/BuffGroupRule`
- `id` · `name` · `costSoul` · `buffTiming` · `buffTarget` · `buffCondition` · `buffList` · `buffGradeList`
- `buffOddRules` · `buffOddGrades`

### `fight/BuffOdds`
- `int` · `int` · `int` · `double` · `double` · `double`

### `fight/BuffView`
- `BuffViewId` · `BuffId` · `IsShowInManual` · `IsIgonreWhenImmediately` · `BuffIcon` · `BuffName` · `BuffDesc` · `PreferViewDuration`
- `PreferViewOffDuration` · `IsShield` · `IsDizzy` · `IsGroup` · `GroupMaxNum` · `GroupBuffParticleId` · `GroupBuffParticleType` · `GroupBuffParticleBoneName`
- `GroupBuffParticleOffset` · `BuffParticle` · `BuffParticleType` · `ParticleType` · `BuffParticleBoneName` · `BuffOffset` · `IsTransfigure` · `TransferTargetModelId`
- `MaterialTransInfo` · `IsSkinTrans` · `SkinTransOn` · `SkinTransOff` · `IsSlience` · `SlienceSkillClass` · `SlienceSkillIndex` · `IsModelTransparent`
- `ModelTransparentDuration` · `DiceNumBuffParticle` · `DiceNumBuffParticleType` · `DiceNumParticleType` · `DiceNumBuffParticleBoneName` · `DiceNumBuffOffset` · `BuffOffViewInfo` · `ChangeHitParticleId`
- `ChangeHitParticleType` · `ChangeHitParticleBone` · `ChangeHitParticleOffset` · `IsRevive` · `TipWord` · `TipWordSize` · `IsTransferPosition` · `TransferParticle`
- `TransferParticleBone` · `IsChaos` · `IsCancelHitView` · `CancelHitViewSelectMutiRule` · `BuffOnAniName` · `BuffOnAniArgs` · `BuffOffAniName` · `BuffOffAniArgs`
- `BuffLastAniName` · `BuffLastAniConfigure` · `DizzyState` · `TransparentValue` · `BuffEffectAniName` · `BuffEffectAniArgs` · `ChangeHitAniName` · `BuffEffectTimer`
- `BuffEffectTimerArgs` · `BuffSummonId` · `BuffFeatureEffectId` · `IsCostActionPointPercent` · `Audios` · `specialBuffType` · `BuffGroup` · `BuffPriority`
- `buffLogName` · `shipSkillBuff` · `BufficonType` · `ExtendSkillParam` · `SpecialQteSkillParam`

**出向外键** (1):
- `BuffId` → `fight/_Buff`

**入向外键** (2):
- `fight/BuffViewFashionExt.buffViewId` → 本表
- `fight/BuffViewGlobal.buffViewId` → 本表

### `fight/BuffViewFashionExt`
- `id` · `buffViewId` · `fashionId` · `IsTransfigure` · `TransferTargetModelId` · `MaterialTransInfo` · `IsSkinTrans` · `SkinTransOn`
- `SkinTransOff`

**出向外键** (1):
- `buffViewId` → `fight/BuffView`

### `fight/BuffViewGlobal`
- `id` · `buffViewId` · `buffName` · `buffDesc` · `PreferViewDuration` · `PreferViewOffDuration` · `BuffParticle` · `BuffParticleType`
- `BuffParticleMountType` · `BuffParticleOffset`

**出向外键** (1):
- `buffViewId` → `fight/BuffView`

### `fight/BuffViewParticleSetting`
- `id` · `particleId` · `isShowInSpecialCamera`

**出向外键** (1):
- `particleId` → `fight/Particle`

### `fight/BuffViewSummon`
- `id` · `modelId` · `modelScale` · `isStatic` · `standPosType` · `standPosArgs` · `apppearAniName` · `disappearAniName`
- `syncAnimLevel` · `forceSyncAnimConfig` · `IsInvolveByCamera` · `IsShowInSpecialCam` · `BuffParticle` · `BuffParticleBoneName` · `BuffOffset` · `HideParticle`
- `HideAniName`

### `fight/ComboDamage`
- `Id` · `Combo` · `Damage`

### `fight/CommonMaterial`
- `Id` · `MaterialName`

### `fight/ExceptNormalParticle`
- `id` · `particleId`

**出向外键** (1):
- `particleId` → `fight/Particle`

### `fight/FeatureEffect`
- `Id` · `lParticleId` · `rParticleId` · `duration` · `delay` · `isPauseAction` · `isSkillBefore` · `posX`
- `posY` · `posZ`

### `fight/FieldEffectFilter`
- `ModelId` · `filterType` · `highParam` · `lowParam`

### `fight/FightBuff`
- `id` · `buffTimings` · `buffTargets` · `buffConditions` · `buffOddRules` · `buffOddGrades` · `buffList` · `buffGradeList`
- `canCombine`

**入向外键** (6):
- `Haki/HakiSkillLevel.fightBuffId` → 本表
- `HeroFashion.fightBuffIds` → 本表
- `SeaPort/SeaPortStrategy.fightBuffId` → 本表
- `heroAssist/HeroAssist.fightBuffId` → 本表
- `potential/TreasureNodeLevel.fightBuffId` → 本表
- `ultimateChallenge/UltimateEntry.fightBuffId` → 本表

### `fight/FightReportBuffDesc`
- `id` · `buffId` · `type` · `propParam` · `descri`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `fight/FightReportConfig`
- `id` · `type` · `typeName` · `descri`

### `fight/FightSkipDeclare`
- `id` · `FightType` · `SubPara` · `IsCanSkip` · `SkipArgs` · `IsCanExit` · `isCanAcclerate` · `defaultSpeed`
- `skipCameraConfig` · `specialCameraSpeed`

### `fight/HeroSelecltRule`
- `heroId` · `TargetSelectRuleSingle`

**出向外键** (1):
- `heroId` → `Hero`

### `fight/Particle`
- `ParticleId` · `ResourceUrl` · `Duration` · `IsLoop`

**入向外键** (5):
- `Scene/SceneNpc.ParticleIds` → 本表
- `fight/BuffViewParticleSetting.particleId` → 本表
- `fight/ExceptNormalParticle.particleId` → 本表
- `fight/SailorModel.ParticleIds` → 本表
- `fight/SailorModelAnimation.ParticleIds` → 本表

### `fight/SailorEffectHide`
- `ModelId` · `HideModel` · `AwakeHideModel`

### `fight/SailorModel`
- `ModelId` · `ModelRes` · `IsMain` · `IsHaveLowModel` · `ModelScale` · `StandHeight` · `Height` · `Radius`
- `DefaultFoundBone` · `RushJumpbType` · `RushAniStartTime` · `RushAniStopTime` · `RushParticle` · `RushEndParticle` · `JumpbStartTime` · `JumpbStopTime`
- `JumpbParticle` · `JumpbEndParticle` · `DeathDuration` · `RecruitCamX` · `RecruitCamY` · `RecruitCamZ` · `RecruitScale` · `IsPlayerSceneParticle`
- `ParticleIds` · `ParticleArgs` · `AdditionMaterialArgs` · `BeConvoyParticleIds` · `BeConvoyParticleArgs` · `DisplayAni` · `Run02DetalValue` · `SwitchRun02Condition`
- `DeathShowType` · `DeathShowArgs` · `IsHuge` · `HugeModelViewScale` · `HugeModelHpBarHeight` · `SpecialType` · `SwitchModleSkinCondition` · `HighModelSkinsOn`
- `HighModelSkinsOff` · `LowModelSkinsOn` · `LowModelSkinsOff` · `RushAudios` · `JumpAudios` · `TransferOffset` · `AwakeParticleids` · `AwakeParticleArgs`

**出向外键** (1):
- `ParticleIds` → `fight/Particle`

### `fight/SailorModelAnimation`
- `id` · `ModelId` · `Type` · `AniName` · `AniLength` · `IsLoop` · `IsPlayerSceneParticle` · `ParticleTypes`
- `ParticleIds` · `ParticleArgs` · `isBindAnim` · `MaterialTransInfo` · `LowMaterialTransInfo`

**出向外键** (1):
- `ParticleIds` → `fight/Particle`

### `fight/SailorModelAudio`
- `Id` · `ModelId` · `AudioType` · `AudioName`

### `fight/SailorModelOffset`
- `ModelId` · `RushAniStartTime` · `RushAniStopTime` · `JumpbStartTime` · `JumpbStopTime`

### `fight/SailorModelSkin`
- `MSId` · `ModelId` · `IsLow` · `MSName` · `IsDefault`

### `fight/SailorModelSkinTrans`
- `MSTId` · `MAId` · `FromMSId` · `ToMSId` · `IsTransSpecifyTime` · `TransStartTime` · `TransDuration` · `LowMSId`
- `LowToMSId` · `LowIsTransSpecifyTime` · `LowTransStartTime` · `LowTransDuration`

### `fight/SailorModelTrans`
- `SMTIId` · `SMTId` · `Weight` · `FromMAId` · `ToMAId` · `TransTimer` · `TransDuration` · `TransProcessType`
- `TransProcessArgs`

### `fight/SailorSkill`
- `SkillId` · `SkillReleaseType` · `SkillElementType` · `SkillState` · `AttackType` · `SailorSkillAnimationId` · `SkillLength` · `SkillComboLength`
- `SkillLastLength` · `IsTotalDamageShow` · `TotalDamageShowTimer` · `Audio` · `AttackStandType` · `AttackStandFixValue` · `CameraClass` · `IsCameraDynamic`
- `CameraSelectRuleHeightFix` · `CameraSelectRuleAboutFix` · `CameraSelectRuleUpDownFix` · `TargetSelectRuleSingle` · `SelectRuleMuti` · `ComboCounter` · `ComboFixTimeValue` · `DeadEffect`
- `CamRevertType` · `ShowCoverTime` · `ShowCoverType` · `IsSpecialCam` · `SpecialCamUrl` · `SpecialCamSkipTimePoint` · `SpecialCamOffset` · `SpecialCamJumpBackType`
- `IsGrabbingSkill` · `GrabBoneSourceType` · `GrabBoneName` · `GrabStartTime` · `GrabLastTime` · `Effects` · `EffBones` · `WEffects`
- `WEffBones` · `ForceSelfPosition` · `SpecialLightAnimResPath` · `BuffFeatureEffectId` · `ModifyRotationY` · `pvpSpecialCamSkipTimePoint` · `enableAddLighting` · `BGMs`
- `hideBattlePanel`

**出向外键** (2):
- `SailorSkillAnimationId` → `fight/SailorSkillAnimation`
- `SkillId` → `fight/Skill`

**入向外键** (3):
- `URRecruit/URRecruitUI.SailorSkillId` → 本表
- `fight/SailorSkillGroup.SailorSkillId` → 本表
- `fight/Skill.SailorSkillId` → 本表

### `fight/SailorSkillAdvance`
- `id` · `SkillId` · `AdvanceSkill`

**出向外键** (1):
- `SkillId` → `fight/Skill`

### `fight/SailorSkillAnimation`
- `id` · `IsHaveTrans` · `AnimationInfo` · `FashionId` · `Fashion_IsHaveTrans` · `Fashion_AnimationInfo`

**入向外键** (1):
- `fight/SailorSkill.SailorSkillAnimationId` → 本表

### `fight/SailorSkillExt`
- `id` · `skillId` · `fashionId` · `Effects` · `EffBones` · `WEffects` · `WEffBones`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `fight/SailorSkillGroup`
- `id` · `SailorSkillGroupId` · `SailorSkillId` · `SailorAdvanceLevel` · `IsDefault`

**出向外键** (1):
- `SailorSkillId` → `fight/SailorSkill`

### `fight/SailorSkillRelease`
- `ReleaseId` · `SkillId` · `ReleaseTime` · `IsEmptyRelease` · `IsBuffEffect` · `ReleaseEffectNum` · `ReleaseWeight` · `ReleaseSelectRule`
- `HitAnims` · `HitAnimNormalizeTime` · `HitAudio` · `HitActorAudioType` · `HitParticles` · `HitParticleType` · `HitParticleBone` · `HitParticleOffset`
- `HitMaterialTransData` · `HitMaterialTransDuration` · `DisplacementFactor` · `DisplacementLimit` · `ProjParticleId` · `ProjRadius` · `ProjInitOffset` · `ProjType`
- `ProjFlyTrailType` · `ProjFlyTrail` · `ProjFlySpeed` · `ProjFlyDuration` · `ProjFlyLastTime` · `ProjTargetInfo` · `PosChangeSpeed` · `PosChangeColliderParticleId`
- `ShakeType` · `DealDelay` · `DisplacementAniType` · `HitAnimPause` · `ReleaseAudio`

**出向外键** (1):
- `SkillId` → `fight/Skill`

### `fight/SailorSkillReleaseHitStop`
- `HitStopId` · `SkillId` · `HitStopTime` · `HitStopDuration` · `HitStopCurve` · `ShakeType`

**出向外键** (1):
- `SkillId` → `fight/Skill`

### `fight/SailorSkillSceneHide`
- `id` · `SkillId` · `Time` · `IsShow` · `ModelName`

**出向外键** (1):
- `SkillId` → `fight/Skill`

### `fight/SailorUltimateSkillHideLogic`
- `id` · `SkillId` · `IsShow` · `SelectDir` · `SelectBlockNum` · `SelectNum` · `TimePoint`

**出向外键** (1):
- `SkillId` → `fight/Skill`

### `fight/Skill`
- `skillId` · `heroId` · `skillType` · `skillCostType` · `skillStep` · `maxLevel` · `isExtensionSkill` · `relationSkillId`
- `isRelationSkill` · `skillName` · `skillDesc` · `skillDescBase` · `skillIcon` · `belongSkillId` · `preSkillId` · `unlockPreSkillLevel`
- `unlockHeroStarNum` · `unlockHeroBreachLevel` · `effectSkillId` · `viewHierarychy` · `viewVertical` · `costActionPoint` · `costAnger` · `damageGrade`
- `isFinal` · `isEnd` · `cooldown` · `SailorSkillId` · `needSwitch` · `PropList` · `PropPercentList` · `buffGroupId`
- `mainBuffId` · `buffTimings` · `buffTargets` · `buffConditions` · `buffOddRules` · `buffOddGrades` · `buffList` · `buffGradeList`
- `possibleTransferSkillIds` · `detailDesc` · `buttonEffect` · `unlockHeroPromotionLevel` · `ultimateType` · `promotionSkill` · `specialSkill` · `unlockHeroAwakeLevel`
- `skillDescNewServer` · `ClassGroup` · `specialDisplaySkillName` · `allSkillBtnInvalid` · `Plname` · `Pldesc`

**出向外键** (2):
- `heroId` → `Hero`
- `SailorSkillId` → `fight/SailorSkill`

**入向外键** (30):
- `DefenseFight/DefenseFightEnemy.skillId` → 本表
- `DefenseFight/DefenseFightFortressDetail.skillId` → 本表
- `DemoEnemySailorAI.SkillId` → 本表
- `Haki/HakiSkill.skillId` → 本表
- `PlotFightEnemyAI.SkillId` → 本表
- `RoguePVE/RogueHandBook.skillId` → 本表
- `RoguePVE/RogueSkill.skillId` → 本表
- `ServerChallenge/Overlord/OverlordBoss.skillids` → 本表
- `SimulationBattle/SimulationBattleFightHeroSkill.skillId` → 本表
- `URHeroIntensify/URHeroIntensify.skillID` → 本表
- … 其余 20 条见 `_tables/table_fk_registry.json`

### `fight/SkillJointAttack`
- `RelatedSkill` · `skillCostLimitItem` · `RelatedHeroId` · `RelatedHeroStar` · `RelatedHeroImpact`

### `fight/SkillLevelStep`
- `id` · `minLev` · `maxLev`

### `fight/SkillLevelupCost`
- `id` · `skillLevel` · `skillCostType` · `levelUpCost` · `skillPoint` · `extraFightPower` · `equipSkillPower` · `atkTrans`
- `powerFactorC` · `heroSkillType` · `levelStep` · `levelUpCostItem` · `普攻` · `主动技能` · `奥义` · `被动技能`
- `附加技能` · `特殊机制` · `怒气延展`

### `fight/SkillLevelupDamage`
- `id` · `selectRuleMuti` · `costAP` · `costAnger` · `grade` · `damage10` · `growthFactor10` · `damage20`
- `growthFactor20` · `damage30` · `growthFactor30` · `damageVal` · `damageValLevelup`

### `fight/SkillLevelupUnlock`
- `id` · `skillLevel` · `skillStep` · `maxLevel` · `heroLevel`

### `fight/SkillLine`
- `lineId` · `heroId` · `fromRow` · `fromCol` · `toRow` · `toCol` · `toSkillId` · `targetType`
- `PromotionSkill`

**出向外键** (1):
- `heroId` → `Hero`

### `fight/SkillLineCorner`
- `id` · `heroId` · `row` · `col` · `cornerType` · `toSkillIds` · `PromotionSkill`

**出向外键** (1):
- `heroId` → `Hero`

### `fight/SkillSpecialConfig`
- `skillStep` · `heroLevel`

### `fight/_BattleResultType`
- `id` · `RoundMax` · `SelfLeftHp` · `SelfLeftPerhp` · `EnemyLeftHp` · `EnemyLeftPerhp` · `SelfHeroLeftHp` · `SelfHeroLeftPerhp`
- `BossLeftHp` · `BossLeftPerhp`

### `fight/_Buff`
- `BuffId` · `BuffClass` · `Round` · `BeforeActiveCount` · `AfterActiveCount` · `ActiveUntilRoundEnd` · `AttCount` · `DefCount`
- `LimitedCount` · `AccumIdCount` · `AccumGroupCount` · `CoverByBuffGroup` · `CanBeCleared` · `PerFactor` · `Factor` · `SomeData`
- `AdditionalBuffs` · `BuffGroup` · `IsDebuff` · `ClearAfterDie`

**入向外键** (19):
- `BeastPirates/BeastPiratesBattleIntent.buffIds` → 本表
- `BeastPirates/BeastPiratesBossBuff.buffId` → 本表
- `BeastPirates/BeastPiratesBossSkill.buffId` → 本表
- `DefenseFight/DefenseFightBuffView.buffId` → 本表
- `HomeLand/HomeProsperity.buffIds` → 本表
- `ShipGroup/ShipGroupTrialBuff.buffId` → 本表
- `SuperSoul/SuperSoulBuff.buffId` → 本表
- `autoChess/AutoChessGroup.buffId` → 本表
- `fight/BuffActive.buffId` → 本表
- `fight/BuffView.BuffId` → 本表
- … 其余 9 条见 `_tables/table_fk_registry.json`

### `fight/_BuffCondition`
- `条件类型` · `条件参数` · `EmptyKey-D2` · `注释` · `EmptyKey-F2`

### `fight/_FightPropLimit`
- `id` · `战斗类型` · `章节id` · `己方属性限制` · `怪的属性限制` · `己方buff`

### `fight/_SkillExtraFightPower`
- `7` · `1` · `999` · `4`
