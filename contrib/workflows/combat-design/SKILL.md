---
name: "combat_design"
description: "战斗设计工作流 — 覆盖技能体系、怪物与BOSS设计、伤害模型、战斗平衡四大维度"
keywords:
  - "战斗"
  - "技能"
  - "怪物"
  - "BOSS"
  - "伤害"
  - "平衡"
  - "属性"
  - "克制"
  - "AI"
tasks:
  - taskId: "TASK-001"
    domain: "COMBAT_DESIGN"
    requirement: |
      技能体系设计: {requirement}
      
      【能力要求】技能体系、伤害模型、属性克制
      【设计维度】
      - 技能分类：主动技能、被动技能、大招、连携技等
      - 释放机制：CD、能量、怒气、连击等触发条件
      - 技能效果：伤害、控制、增益、减益、位移等
      - 技能升级：等级成长、品质提升、觉醒效果
      
      使用 wiki_lookup 查询技能相关文档，使用 kg_query 查询技能与角色的关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "combat_design_output.md"
    
  - taskId: "TASK-002"
    domain: "COMBAT_DESIGN"
    requirement: |
      怪物与BOSS设计: {requirement}
      
      【能力要求】怪物设计、BOSS 机制、难度曲线
      【设计维度】
      - 怪物分类：普通怪、精英怪、BOSS、世界BOSS
      - 属性设计：血量、攻击、防御、速度、抗性
      - 技能机制：普通攻击、特殊技能、阶段转换、狂暴机制
      - AI 行为：仇恨机制、技能释放优先级、站位逻辑
      
      使用 wiki_relations 查询怪物与关卡的关系，使用 table_list 查看怪物配表。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "combat_design_output.md"
    
  - taskId: "TASK-003"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      伤害模型设计: {requirement}
      
      【能力要求】伤害模型、公式设计、属性克制
      【设计维度】
      - 伤害公式：基础伤害、属性加成、暴击、减伤计算
      - 属性克制：元素克制、职业克制、种族克制
      - 伤害类型：物理、魔法、真实伤害
      - 战斗数值：攻击力、防御力、暴击率、暴击伤害、命中、闪避
      
      基于 TASK-001、TASK-002 的产出（使用 workspace_read 读取），设计伤害计算公式。
      使用 table_copy_to_workspace 复制相关配表到 workspace 进行修改。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-004"
    domain: "COMBAT_DESIGN"
    requirement: |
      战斗平衡设计: {requirement}
      
      【能力要求】战斗平衡、难度曲线、数据分析
      【设计维度】
      - 职业平衡：不同职业的强度对比、定位差异
      - 技能平衡：技能强度、CD 与伤害的平衡
      - 难度曲线：关卡难度递增、BOSS 难度分层
      - 战斗时长：单场战斗的预期时长、DPS 要求
      
      基于 TASK-001、TASK-002、TASK-003 的产出（使用 workspace_read 读取），进行平衡性分析。
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "combat_design_output.md"
    
  - taskId: "TASK-005"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      使用 workspace_list 和 workspace_read 读取 TASK-001 ~ TASK-004 的全部产出。
      
      【审阅清单】
      - 四大维度是否完整覆盖
      - 技能体系是否完整且平衡
      - 怪物与BOSS设计是否合理
      - 伤害模型是否可计算、可验证
      - 战斗平衡是否考虑了职业差异
      - 配表文件使用 table_validate 校验
      
      【边界检查】
      - 数值是否预留扩展空间（避免数值膨胀）
      - 伤害公式是否考虑了极端情况
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 战斗设计工作流

严格按照主策划提供的《文档生成 — 任务拆解与分配》中的"战斗相关"四大维度拆分任务。

## 执行顺序

```
TASK-001 (技能体系) ──┐
                      ├──→ TASK-003 (伤害模型) ──→ TASK-004 (战斗平衡)
TASK-002 (怪物BOSS) ──┘                              │
                                                     └──→ TASK-005 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应维度 |
|------|--------|---------|
| TASK-001 | 技能体系文档 | 技能体系 |
| TASK-002 | 怪物与BOSS设计文档 | 怪物与BOSS设计 |
| TASK-003 | 伤害模型文档 + 配表 | 伤害模型 |
| TASK-004 | 战斗平衡分析报告 | 战斗平衡 |
| TASK-005 | QA 审阅报告 | - |

## 设计原则

- **数值可验证**：伤害公式必须可计算、可测试
- **预留扩展空间**：避免数值膨胀不可控（遵循新版边界约束）
- **职业差异化**：不同职业有明确定位和强度差异
- **SubAgent 匹配**：战斗策划主导 TASK-001/002/004，数值策划主导 TASK-003
