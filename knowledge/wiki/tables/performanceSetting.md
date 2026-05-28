---
type: table_schema
title: "表族 performanceSetting"
group: "performanceSetting"
table_count: 8
---

# 表族 `performanceSetting`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `performanceSetting/DetailLevelSetting` | 7 | performanceSetting/DetailLevelSetting.xlsx |
| `performanceSetting/GameModuleShadowSetting` | 7 | performanceSetting/GameModuleShadowSetting.xlsx |
| `performanceSetting/GraphicSettingsPreset` | 10 | performanceSetting/GraphicSettingsPreset.xlsx |
| `performanceSetting/ParticleSetting` | 4 | performanceSetting/ParticleSetting.xlsx |
| `performanceSetting/PerformanceSettingPreset` | 16 | performanceSetting/PerformanceSettingPreset.xlsx |
| `performanceSetting/PostEffectSetting` | 6 | performanceSetting/PostEffectSetting.xlsx |
| `performanceSetting/ShadowSetting` | 9 | performanceSetting/ShadowSetting.xlsx |
| `performanceSetting/_DevicePreferPreset` | 5 | performanceSetting/_DevicePreferPreset.xlsx |

## 字段明细
### `performanceSetting/DetailLevelSetting`
- `Id` · `shaderQuality` · `supportPlanarReflectionTexture` · `planarReflectionTexRenderFreq` · `planarReflectionTexRenderScale` · `planarReflectionUseSimpleMat` · `qualityLevel`

### `performanceSetting/GameModuleShadowSetting`
- `Id` · `mainLightShadowmapResolution` · `shadowDepthBits` · `shadowDistance` · `shadowCascadeCount` · `shadowCascadeSplit` · `supportsSoftShadows`

### `performanceSetting/GraphicSettingsPreset`
- `Id` · `GeneralPreset` · `FPSLimit` · `RenderScale` · `AntiAliasing` · `RealTimeShadow` · `DetailLevel` · `PostEffectLevel`
- `ParticleQuality` · `PRPFog`

### `performanceSetting/ParticleSetting`
- `Id` · `renderLowResolutionTransparent` · `opaqueDownsampling` · `enableSoftParticle`

### `performanceSetting/PerformanceSettingPreset`
- `presetId` · `SocType` · `GPUType` · `GeneralPreset` · `FPSMaxLimit` · `BaseResPixelCount` · `BaseResMinRatio` · `SacleFactor`
- `SupportAntiAlasing` · `SupportRealTimeShadow` · `SupportSoftShadow` · `SupportHDR` · `SupportPostProcessing` · `SupportWaterFeature` · `SupportPostOutline` · `SupportUIPageAA`

### `performanceSetting/PostEffectSetting`
- `Id` · `enableHDR` · `enableTonemapping` · `enableBloom` · `enableBlurEffect` · `enablePostOutline`

### `performanceSetting/ShadowSetting`
- `Id` · `supportsMainLightShadows` · `supportsAdditionalLightShadows` · `mainLightShadowmapResolution` · `shadowDepthBits` · `shadowDistance` · `shadowCascadeCount` · `shadowCascadeSplit`
- `supportsSoftShadows`

### `performanceSetting/_DevicePreferPreset`
- `index` · `MatchType` · `GPUModelName` · `DeviceModelName` · `PresetID`
