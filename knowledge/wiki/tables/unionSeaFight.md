---
type: table_schema
title: "表族 unionSeaFight"
group: "unionSeaFight"
table_count: 18
---

# 表族 `unionSeaFight`

共 18 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `unionSeaFight/USFAIShip` | 7 | unionSeaFight/USFAIShip.xlsx |
| `unionSeaFight/USFBuff` | 14 | unionSeaFight/USFBuff.xlsx |
| `unionSeaFight/USFFlag` | 2 | unionSeaFight/USFFlag.xlsx |
| `unionSeaFight/USFFortress` | 15 | unionSeaFight/USFFortress.xlsx |
| `unionSeaFight/USFFortressDetail` | 21 | unionSeaFight/USFFortressDetail.xlsx |
| `unionSeaFight/USFFortressLevel` | 7 | unionSeaFight/USFFortressLevel.xlsx |
| `unionSeaFight/USFMap` | 4 | unionSeaFight/USFMap.xlsx |
| `unionSeaFight/USFPromotion` | 7 | unionSeaFight/USFPromotion.xlsx |
| `unionSeaFight/USFRankAwards` | 6 | unionSeaFight/USFRankAwards.xlsx |
| `unionSeaFight/USFRoute` | 12 | unionSeaFight/USFRoute.xlsx |
| `unionSeaFight/USFRouteDetail` | 6 | unionSeaFight/USFRouteDetail.xlsx |
| `unionSeaFight/USFSkill` | 16 | unionSeaFight/USFSkill.xlsx |
| `unionSeaFight/UnionSeaFightTime` | 5 | unionSeaFight/UnionSeaFightTime.xlsx |
| `unionSeaFight/_USFAwards` | 16 | unionSeaFight/_USFAwards.xlsx |
| `unionSeaFight/_USFMoveTips` | 5 | unionSeaFight/_USFMoveTips.xlsx |
| `unionSeaFight/_UnionSeaFightActivity` | 19 | unionSeaFight/_UnionSeaFightActivity.xlsx |
| `unionSeaFight/_UnionSeaFightActivityTime` | 6 | unionSeaFight/_UnionSeaFightActivityTime.xlsx |
| `unionSeaFight/_UnionSeaFightServerGroup` | 7 | unionSeaFight/_UnionSeaFightServerGroup.xlsx |

## 字段明细
### `unionSeaFight/USFAIShip`
- `id` · `enemyId` · `shipId` · `level` · `nickName` · `icon` · `liveSeconds`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `unionSeaFight/USFBuff`
- `buffId` · `battleBuffers` · `totalTime` · `duration` · `groupId` · `canRepeat` · `priority` · `isClientSide`
- `stateEffect` · `activateEffect` · `icon` · `fortrestParticle` · `buffDesc` · `isShowFlyText`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `unionSeaFight/USFFlag`
- `id` · `materialTransName`

### `unionSeaFight/USFFortress`
- `id` · `mapId` · `type` · `campType` · `name` · `posX` · `posY` · `posZ`
- `dirX` · `dirY` · `dirZ` · `modelOffset` · `scale` · `enemyGroupId` · `occupyGainIntegral`

### `unionSeaFight/USFFortressDetail`
- `id` · `type` · `buildNum` · `buildTime` · `cost` · `unlockBuildingLev` · `collisionSize` · `modelId`
- `baseModelRes` · `redFlagId` · `blueFlagId` · `neutralFlagId` · `iconName` · `fortressIcon` · `activeEffectId` · `activeEffectAnchorPath`
- `typeName` · `typeDesc` · `isTechShow` · `isTechLevel` · `buildEffect`

### `unionSeaFight/USFFortressLevel`
- `id` · `fortressDetailId` · `level` · `cost` · `usfSkills` · `levelDesc` · `fortressDescription`

### `unionSeaFight/USFMap`
- `id` · `center` · `bound` · `animName`

### `unionSeaFight/USFPromotion`
- `id` · `sourceDetailId` · `targetDetailId` · `costTime` · `icon` · `desc` · `buildNum`

### `unionSeaFight/USFRankAwards`
- `id` · `fromRank` · `toRank` · `managerTitleId` · `memberTitleId` · `seasonReward`

### `unionSeaFight/USFRoute`
- `id` · `mapId` · `startFortressId` · `endFortressId` · `detailId` · `routeType` · `isOneWay` · `length`
- `reverseLength` · `allowShipIds` · `streamChangeInterval` · `waypoints`

### `unionSeaFight/USFRouteDetail`
- `id` · `effectId` · `iconName` · `routeName` · `routeDesc` · `mapArray`

### `unionSeaFight/USFSkill`
- `skillId` · `skillType` · `triggerType` · `unloadType` · `activeTime` · `closeType` · `triggerCondition` · `initialDelay`
- `duration` · `selectType` · `selectCondition` · `usfBuffers` · `usfSkillEvents` · `stateParticle` · `icon` · `desc`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `unionSeaFight/UnionSeaFightTime`
- `id` · `fightBatchIndex` · `seaFightType` · `timeStr` · `cacheKey`

### `unionSeaFight/_USFAwards`
- `id` · `分类
（1=海战
2=宣战）` · `结果类型
(0平局
1胜利
2大胜
3失败)` · `积分变化
(减少填负数)` · `公会奖励` · `玩家获得公会贡献` · `托管玩家获得公会贡献` · `达到此结果类型的玩家阵亡比例
(小于此比例)`
- `给到拍卖行的奖励掉落组` · `海战剩余人数增加的积分(每几个人)` · `海战剩余人数增加的积分加多少分` · `海战连杀增加的贡献` · `增加的公会经验` · `玩家获得奖励` · `托管玩家获得奖励` · `活动ID`

### `unionSeaFight/_USFMoveTips`
- `唯一ID` · `起始据点ID` · `结束据点ID` · `不提示的船只ID(多个逗号分隔)` · `提示`

### `unionSeaFight/_UnionSeaFightActivity`
- `id` · `unlockUnionLev` · `needPlayerNum` · `maxFightPlayerNum` · `initIntegral` · `applyWeek` · `applyTime` · `matchWeek`
- `matchTime` · `joinEndWeek` · `joinEndTime` · `fightWeek` · `declareApplyWeek` · `declareFightWeek` · `fightReadyTime` · `fightTime`
- `balanceTime` · `refreshRankTime` · `resetWeek`

### `unionSeaFight/_UnionSeaFightActivityTime`
- `id` · `fightBatchIndex` · `seaFightType` · `timeStr` · `cacheKey` · `activityId`

### `unionSeaFight/_UnionSeaFightServerGroup`
- `id` · `serverIds` · `activityId` · `testStartTime` · `openStartTime` · `matchGroup` · `note`
