---
type: table_schema
title: "表族 DemoHero"
group: "DemoHero"
table_count: 3
---

# 表族 `DemoHero`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `DemoHero/DemoHeroLevelProp` | 13 | DemoHero/DemoHeroLevelProp.xlsx |
| `DemoHero/DemoHeroPropOffset` | 13 | DemoHero/DemoHeroPropOffset.xlsx |
| `DemoHero/_DemoHeroConfig` | 3 | DemoHero/_DemoHeroConfig.xlsx |

## 字段明细
### `DemoHero/DemoHeroLevelProp`
- `heroLevel` · `atk` · `def` · `maxHp` · `speed` · `hit` · `dodge` · `block`
- `antiblock` · `cri` · `anticri` · `cridamage` · `anticridamage`

### `DemoHero/DemoHeroPropOffset`
- `heroId` · `atkRate` · `defRate` · `hpRate` · `speedOffset` · `hitOffset` · `dodgeOffset` · `blockOffset`
- `antiblockOffset` · `criOffset` · `anticriOffset` · `cridamageOffset` · `anticridamageOffset`

**出向外键** (1):
- `heroId` → `Hero`

### `DemoHero/_DemoHeroConfig`
- `id` · `heroId` · `expireTime`

**出向外键** (1):
- `heroId` → `Hero`
