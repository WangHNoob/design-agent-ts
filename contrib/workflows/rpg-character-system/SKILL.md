---
name: "rpg-character-system"
description: "RPG角色系统策划工作流 — 覆盖从系统设计、数值规划、战斗设计到QA审阅的完整角色系统开发流程"
keywords:
  - "角色"
  - "英雄"
  - "属性"
  - "成长"
  - "技能"
  - "升级"
  - "等级"
  - "Hero"
  - "RPG"
tasks:
  - taskId: "TASK-001"
    domain: "SYSTEM_DESIGN"
    requirement: |
      系统设计: {requirement}
      
      【能力要求】规则设计、流程设计、状态机、边界处理、系统架构
      【设计内容】角色属性体系、角色分类（职业/阵营）、角色获取方式、角色界面流程
      【关键边界】操作流程、解锁条件、状态流转、边界与异常
      
      使用 wiki_lookup 查询 Hero 相关系统文档作为参考。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
  - taskId: "TASK-002"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      数值规划: {requirement}
      
      【能力要求】公式设计、成长曲线、经济平衡、产销分析
      【设计内容】核心属性定义、等级成长曲线、战力计算公式、属性转换规则
      【关键边界】成长公式、战力计算、收益曲线、瓶颈节奏
      
      基于 TASK-001 的系统设计（使用 workspace_read 读取），设计数值模型。
      使用 table_list 查看 Hero、HeroLevel、HeroStarGrowth 等配表，使用 table_copy_to_workspace 复制到 workspace 进行修改。
    dependencies:
      - "TASK-001"
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
  - taskId: "TASK-003"
    domain: "COMBAT_DESIGN"
    requirement: |
      战斗设计: {requirement}
      
      【能力要求】关卡设计、战斗体验、难度曲线
      【设计内容】技能类型、释放机制、技能效果计算公式、战斗AI行为
      
      基于 TASK-001、TASK-002 的产出（使用 workspace_read 读取），设计技能系统。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "DOCUMENT"
    outputTemplate: "combat_design_output.md"
  - taskId: "TASK-004"
    domain: "GAMEPLAY_DESIGN"
    requirement: |
      玩法设计: {requirement}
      
      【能力要求】玩法原型、UI 流程、操作反馈
      【设计内容】升级、突破、觉醒、装备、羁绊等养成线，以及对应的界面交互流程
      【关键边界】操作反馈、爽感节点、阶段目标感
      
      基于 TASK-001 的系统设计（使用 workspace_read 读取），设计养成玩法。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "gameplay_design_output.md"
  - taskId: "TASK-005"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      使用 workspace_list 和 workspace_read 读取 TASK-001 ~ TASK-004 的全部产出，
      进行一致性、完整性、合理性检查。
      如果有配表文件（.xlsx），使用 table_validate 校验配表结构和数据。
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# RPG 角色系统设计工作流

完整覆盖从系统设计到 QA 审阅的角色系统开发流程。

## 执行顺序

```
TASK-001 (系统设计)
    ├──→ TASK-002 (数值规划) ──→ TASK-003 (战斗设计)
    │                                │
    └──→ TASK-004 (玩法设计) ────────┴──→ TASK-005 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 格式 |
|------|--------|------|
| TASK-001 | 角色系统架构文档 | output.md + references.json |
| TASK-002 | 数值规划文档 + 配表文件 | output.md + *.xlsx |
| TASK-003 | 战斗技能设计文档 | output.md + references.json |
| TASK-004 | 养成玩法设计文档 | output.md + references.json |
| TASK-005 | QA 审阅报告 + 问题清单 | output.md + issues.json |

## 注意事项

- TASK-002 使用 table_* 工具创建实际配表文件，其他任务可读取这些文件
- 所有任务必须使用 workspace_read 读取前置任务的产出
- TASK-005 的 table_validate 校验是配表质量的最后防线
