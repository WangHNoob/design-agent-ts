---
type: table_schema
title: "表族 DefenseFight"
group: "DefenseFight"
table_count: 12
---

# 表族 `DefenseFight`

共 12 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `DefenseFight/DefenseFightBuffView` | 4 | DefenseFight/DefenseFightBuffView.xlsx |
| `DefenseFight/DefenseFightChapter` | 15 | DefenseFight/DefenseFightChapter.xlsx |
| `DefenseFight/DefenseFightEnemy` | 14 | DefenseFight/DefenseFightEnemy.xlsx |
| `DefenseFight/DefenseFightFortress` | 15 | DefenseFight/DefenseFightFortress.xlsx |
| `DefenseFight/DefenseFightFortressDetail` | 13 | DefenseFight/DefenseFightFortressDetail.xlsx |
| `DefenseFight/DefenseFightRoute` | 7 | DefenseFight/DefenseFightRoute.xlsx |
| `DefenseFight/DefenseFightRoutePoint` | 8 | DefenseFight/DefenseFightRoutePoint.xlsx |
| `DefenseFight/DefenseFightText` | 2 | DefenseFight/DefenseFightText.xlsx |
| `DefenseFight/DefenseFigthAchievement` | 3 | DefenseFight/DefenseFigthAchievement.xlsx |
| `DefenseFight/_DefenseFightBuff` | 7 | DefenseFight/_DefenseFightBuff.xlsx |
| `DefenseFight/_DefenseFightEnemyGroup` | 2 | DefenseFight/_DefenseFightEnemyGroup.xlsx |
| `DefenseFight/_DefenseFightSkill` | 13 | DefenseFight/_DefenseFightSkill.xlsx |

## 字段明细
### `DefenseFight/DefenseFightBuffView`
- `id` · `buffId` · `effectId` · `icon`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `DefenseFight/DefenseFightChapter`
- `chapterId` · `preChapterId` · `reward` · `maxFortress` · `enemyGroup` · `energy` · `unLockFortress` · `unLockAchievement`
- `sceneId` · `routeMapId` · `name` · `offsetY` · `cameraPos` · `cameraBound` · `desc`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `DefenseFight/DefenseFightEnemy`
- `id` · `name` · `HP` · `ATK` · `speed` · `ASPD` · `shipModelId` · `modelScale`
- `modelOffset` · `radius` · `propertyMaxAndMin` · `skillId` · `initBuffIds` · `attackBuffIds`

**出向外键** (2):
- `skillId` → `fight/Skill`
- `shipModelId` → `ship/ShipModel`

### `DefenseFight/DefenseFightFortress`
- `id` · `name` · `type` · `modelId` · `modelOffset` · `scale` · `collisionSize` · `icon`
- `shootEffectID` · `projectileEffectID` · `beHitEffectID` · `shellType` · `cannonObjName` · `shootEffectRoot` · `desc`

### `DefenseFight/DefenseFightFortressDetail`
- `id` · `name` · `HP` · `ATK` · `ASPD` · `energy` · `isShow` · `canBuild`
- `attackRange` · `propertyMaxAndMin` · `skillId` · `initBuffIds` · `attackBuffIds`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `DefenseFight/DefenseFightRoute`
- `id` · `routeMapId` · `startFortressId` · `endFortressId` · `length` · `type` · `effectId`

### `DefenseFight/DefenseFightRoutePoint`
- `id` · `type` · `posX` · `posY` · `posZ` · `functionType` · `modelRes` · `routeMapId`

### `DefenseFight/DefenseFightText`
- `id` · `content`

### `DefenseFight/DefenseFigthAchievement`
- `id` · `rewards` · `desc`

### `DefenseFight/_DefenseFightBuff`
- `id` · `type` · `buffTriggerType` · `buffInvalidType` · `duration` · `totalTime` · `valueEffect`

### `DefenseFight/_DefenseFightEnemyGroup`
- `id` · `enemyIds`

### `DefenseFight/_DefenseFightSkill`
- `id` · `type` · `closeType` · `triggerType` · `targetType` · `targetParams` · `selectType` · `selectParams`
- `targetNum` · `initDelay` · `duration` · `totalTime` · `effectBuffs`
