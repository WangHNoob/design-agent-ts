---
type: table_schema
title: "表族 union"
group: "union"
table_count: 38
---

# 表族 `union`

共 38 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `union/UnionBanquetGoods` | 7 | union/UnionBanquetGoods.xlsx |
| `union/UnionBanquetGoodsReward` | 5 | union/UnionBanquetGoodsReward.xlsx |
| `union/UnionBanquetOpenTime` | 3 | union/UnionBanquetOpenTime.xlsx |
| `union/UnionBanquetStage` | 7 | union/UnionBanquetStage.xlsx |
| `union/UnionBanquetType` | 5 | union/UnionBanquetType.xlsx |
| `union/UnionBattery` | 5 | union/UnionBattery.xlsx |
| `union/UnionBatteryLev` | 12 | union/UnionBatteryLev.xlsx |
| `union/UnionBatterySkill` | 7 | union/UnionBatterySkill.xlsx |
| `union/UnionBatterySuit` | 10 | union/UnionBatterySuit.xlsx |
| `union/UnionBuildBatteryExp` | 2 | union/UnionBuildBatteryExp.xlsx |
| `union/UnionBuilding` | 6 | union/UnionBuilding.xlsx |
| `union/UnionBuildingLev` | 13 | union/UnionBuildingLev.xlsx |
| `union/UnionChat` | 2 | union/UnionChat.xlsx |
| `union/UnionCommandHelp` | 6 | union/UnionCommandHelp.xlsx |
| `union/UnionControlCenterSkill` | 89 | union/UnionControlCenterSkill.xlsx |
| `union/UnionCurrencyMax` | 5 | union/UnionCurrencyMax.xlsx |
| `union/UnionLev` | 9 | union/UnionLev.xlsx |
| `union/UnionPrayFrag` | 5 | union/UnionPrayFrag.xlsx |
| `union/UnionPrayFragNum` | 5 | union/UnionPrayFragNum.xlsx |
| `union/UnionRedPacket` | 13 | union/UnionRedPacket.xlsx |
| `union/UnionRepairTimes` | 4 | union/UnionRepairTimes.xlsx |
| `union/UnionRepairType` | 5 | union/UnionRepairType.xlsx |
| `union/UnionSceneType` | 7 | union/UnionSceneType.xlsx |
| `union/UnionShop` | 3 | union/UnionShop.xlsx |
| `union/UnionShopAuction` | 6 | union/UnionShopAuction.xlsx |
| `union/UnionStoreroomDonate` | 10 | union/UnionStoreroomDonate.xlsx |
| `union/UnionStoreroomGuard` | 7 | union/UnionStoreroomGuard.xlsx |
| `union/UnionTRStrategy` | 3 | union/UnionTRStrategy.xlsx |
| `union/UnionTask` | 4 | union/UnionTask.xlsx |
| `union/UnionTaskReward` | 3 | union/UnionTaskReward.xlsx |
| `union/UnionTradeShipBuff` | 4 | union/UnionTradeShipBuff.xlsx |
| `union/UnionTradeShipBuffList` | 4 | union/UnionTradeShipBuffList.xlsx |
| `union/UnionTradeShipItem` | 6 | union/UnionTradeShipItem.xlsx |
| `union/UnionTradeShipItemType` | 4 | union/UnionTradeShipItemType.xlsx |
| `union/UnionTradeShipReward` | 15 | union/UnionTradeShipReward.xlsx |
| `union/UnionTradeShipTimes` | 2 | union/UnionTradeShipTimes.xlsx |
| `union/UnionTradeShipWeekReward` | 2 | union/UnionTradeShipWeekReward.xlsx |
| `union/UnionTrainRoomSkill` | 11 | union/UnionTrainRoomSkill.xlsx |

## 字段明细
### `union/UnionBanquetGoods`
- `goodsId` · `goodsName` · `pushGoodsType` · `buyCost` · `ownReward` · `icon` · `musicResource`

### `union/UnionBanquetGoodsReward`
- `id` · `goodsId` · `buildLev` · `otherReward` · `exReward`

### `union/UnionBanquetOpenTime`
- `id` · `dayTime` · `startTime`

### `union/UnionBanquetStage`
- `stageId` · `stageName` · `startTime` · `endTime` · `pushGoodsType` · `isBanquetEnd` · `freeGoodsId`

### `union/UnionBanquetType`
- `banquetType` · `banquetName` · `openCost` · `needStage` · `icon`

### `union/UnionBattery`
- `batteryId` · `unionType` · `batteryName` · `batteryResource` · `defaultSuit`

### `union/UnionBatteryLev`
- `id` · `batteryId` · `batteryLev` · `buildNumLimit` · `activeSkillLimit` · `upgradeExp` · `batteryAtt` · `batteryDef`
- `batteryHp` · `batterySpeed` · `unionPropAdd` · `unionPropPerAdd`

### `union/UnionBatterySkill`
- `id` · `batteryId` · `batterySkillId` · `batterySkillName` · `batterySkillIcon` · `batterySkillDesc` · `batterySkillUnlockLev`

### `union/UnionBatterySuit`
- `suitId` · `batteryId` · `suitName` · `suitResource` · `buyCost` · `unionFightPorpAdd` · `unionFightPropPerAdd` · `unionSeaFightPorpAdd`
- `unionSeaFightPropPerAdd` · `addPropDesc`

### `union/UnionBuildBatteryExp`
- `itemId` · `exp`

**出向外键** (1):
- `itemId` → `Item`

### `union/UnionBuilding`
- `buildingType` · `buildingName` · `initBuildingLev` · `unlockPreUnionLev` · `bingNpcId` · `npcChat`

### `union/UnionBuildingLev`
- `id` · `buildingType` · `level` · `upgradeCost` · `upgradeTime` · `upgradeExp` · `buildingLevParam` · `levelEffect`
- `upGradingPath` · `modelPath` · `plotId` · `showObstacle` · `hideObstacle`

**出向外键** (1):
- `plotId` → `Plot`

### `union/UnionChat`
- `chatId` · `chatContent`

### `union/UnionCommandHelp`
- `id` · `isLeftText` · `isRightText` · `leftIndex` · `rightIndex` · `currNameIndex`

### `union/UnionControlCenterSkill`
- `ID` · `技能id` · `技能等级` · `消耗公会资金` · `公会属性直接加成` · `公会属性百分比加成` · `名称` · `图标`
- `EmptyKey-I2` · `EmptyKey-J2` · `EmptyKey-K2` · `EmptyKey-L2` · `EmptyKey-M2` · `EmptyKey-N2` · `EmptyKey-O2` · `EmptyKey-P2`
- `EmptyKey-Q2` · `EmptyKey-R2` · `EmptyKey-S2` · `EmptyKey-T2` · `EmptyKey-U2` · `EmptyKey-V2` · `EmptyKey-W2` · `EmptyKey-X2`
- `EmptyKey-Y2` · `EmptyKey-Z2` · `EmptyKey-AA2` · `EmptyKey-AB2` · `EmptyKey-AC2` · `EmptyKey-AD2` · `EmptyKey-AE2` · `EmptyKey-AF2`
- `EmptyKey-AG2` · `EmptyKey-AH2` · `EmptyKey-AI2` · `EmptyKey-AJ2` · `EmptyKey-AK2` · `EmptyKey-AL2` · `EmptyKey-AM2` · `EmptyKey-AN2`
- `EmptyKey-AO2` · `EmptyKey-AP2` · `EmptyKey-AQ2` · `EmptyKey-AR2` · `EmptyKey-AS2` · `EmptyKey-AT2` · `EmptyKey-AU2` · `EmptyKey-AV2`
- `EmptyKey-AW2` · `EmptyKey-AX2` · `EmptyKey-AY2` · `EmptyKey-AZ2` · `EmptyKey-BA2` · `EmptyKey-BB2` · `EmptyKey-BC2` · `EmptyKey-BD2`
- `EmptyKey-BE2` · `EmptyKey-BF2` · `EmptyKey-BG2` · `EmptyKey-BH2` · `EmptyKey-BI2` · `EmptyKey-BJ2` · `EmptyKey-BK2` · `EmptyKey-BL2`
- `EmptyKey-BM2` · `EmptyKey-BN2` · `EmptyKey-BO2` · `EmptyKey-BP2` · `EmptyKey-BQ2` · `EmptyKey-BR2` · `EmptyKey-BS2` · `EmptyKey-BT2`
- `EmptyKey-BU2` · `EmptyKey-BV2` · `EmptyKey-BW2` · `EmptyKey-BX2` · `EmptyKey-BY2` · `EmptyKey-BZ2` · `EmptyKey-CA2` · `EmptyKey-CB2`
- `EmptyKey-CC2` · `EmptyKey-CD2` · `EmptyKey-CE2` · `EmptyKey-CF2` · `EmptyKey-CG2` · `EmptyKey-CH2` · `EmptyKey-CI2` · `EmptyKey-CJ2`
- `EmptyKey-CK2`

### `union/UnionCurrencyMax`
- `id` · `buildLev` · `currencyType` · `maxNum` · `warnPercent`

### `union/UnionLev`
- `level` · `maxMemberNum` · `perDayExp` · `maxBuildingUpgradeNum` · `maxUnionTaskNum` · `maintainFund` · `unionPorpAdd` · `unionPropPerAdd`
- `maxUnionDailyExp`

### `union/UnionPrayFrag`
- `id` · `fragType` · `fragId` · `fragName` · `fragIcon`

### `union/UnionPrayFragNum`
- `id` · `fragType` · `canPrayNum` · `canGiveNum` · `getReward`

### `union/UnionRedPacket`
- `redPacketId` · `redPacketName` · `sendCost` · `sendReward` · `currencyType` · `maxNum` · `maxPerson` · `minMoney`
- `maxMoney` · `isRandom` · `dailySendMax` · `dailyGetMax` · `validHour`

### `union/UnionRepairTimes`
- `id` · `typeId` · `repairTimes` · `buyCost`

### `union/UnionRepairType`
- `typeId` · `typeDesc` · `unionContribution` · `repairNum` · `timesType`

### `union/UnionSceneType`
- `id` · `sceneMapId` · `type` · `createCost` · `modifyUnionNameCost` · `resource` · `initResource`

### `union/UnionShop`
- `shopType` · `openLev` · `shopName`

### `union/UnionShopAuction`
- `shopId` · `itemInfo` · `openLev` · `startPrice` · `minAdd` · `weight`

### `union/UnionStoreroomDonate`
- `id` · `donateName` · `donateIcon` · `donateCost` · `getContribution` · `getUnionCurrency` · `getUnionResource` · `getUnionExp`
- `unionActive` · `unionSLGActive`

### `union/UnionStoreroomGuard`
- `buildingLev` · `guardName` · `guardModel` · `guardAtt` · `guardDef` · `guardHP` · `guardSpeed`

### `union/UnionTRStrategy`
- `strategyId` · `unlockUnionLev` · `showOrder`

### `union/UnionTask`
- `id` · `times` · `taskId` · `weight`

### `union/UnionTaskReward`
- `taskId` · `reward` · `unionExp`

### `union/UnionTradeShipBuff`
- `buffId` · `typeId` · `addPercent` · `buffDesc`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `union/UnionTradeShipBuffList`
- `id` · `weekday` · `buildingLev` · `buffList`

### `union/UnionTradeShipItem`
- `id` · `typeId` · `itemBaseId` · `itemValue` · `isShow` · `GroupNum`

### `union/UnionTradeShipItemType`
- `type` · `typeName` · `itemBaseType` · `bagType`

### `union/UnionTradeShipReward`
- `id` · `lowValue` · `highValue` · `dropGroup` · `tradeTime` · `speedCost` · `speedCostPerSceond` · `buildingLev`
- `showName` · `showDrop` · `quality` · `bigIcon` · `smallIcon` · `bgIcon` · `desc`

### `union/UnionTradeShipTimes`
- `buyTimes` · `buyCost`

### `union/UnionTradeShipWeekReward`
- `curValue` · `reward`

### `union/UnionTrainRoomSkill`
- `id` · `skillId` · `level` · `cost` · `unionPorpAdd` · `unionPropPerAdd` · `name` · `icon`
- `powerFactorB` · `powerFactorC` · `powerFactorD`

**出向外键** (1):
- `skillId` → `fight/Skill`
