---
type: table_schema
title: "表族 config"
group: "config"
table_count: 6
---

# 表族 `config`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `config/Config` | 4 | config/Config.xlsx |
| `config/FPSAnalysisConfig` | 4 | config/FPSAnalysisConfig.xlsx |
| `config/PerformanceSettingConfig` | 4 | config/PerformanceSettingConfig.xlsx |
| `config/PropertyEvaluateDisplayPercent` | 4 | config/PropertyEvaluateDisplayPercent.xlsx |
| `config/SocialConfig` | 4 | config/SocialConfig.xlsx |
| `config/TradeConfig` | 4 | config/TradeConfig.xlsx |

## 字段明细
### `config/Config`
- `intro` · `NameValue` · `StaticName` · `VarType`

**入向外键** (1):
- `BagConfig.configId` → 本表

### `config/FPSAnalysisConfig`
- `intro` · `NameValue` · `StaticName` · `VarType`

### `config/PerformanceSettingConfig`
- `intro` · `NameValue` · `StaticName` · `VarType`

### `config/PropertyEvaluateDisplayPercent`
- `intro` · `NameValue` · `StaticName` · `VarType`

### `config/SocialConfig`
- `intro` · `NameValue` · `StaticName` · `valType`

### `config/TradeConfig`
- `intro` · `NameValue` · `StaticName` · `VarType`
