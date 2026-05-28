---
name: "cultivation_system"
description: "养成系统策划工作流 — 覆盖系统规则、产销关系、数值模型、玩法体验、商业化关联五大维度"
keywords:
  - "养成"
  - "成长"
  - "升级"
  - "突破"
  - "觉醒"
  - "装备"
  - "强化"
  - "进阶"
  - "培养"
  - "养成线"
tasks:
  - taskId: "TASK-001"
    domain: "SYSTEM_DESIGN"
    requirement: |
      系统规则设计: {requirement}
      
      【能力要求】规则设计、流程设计、状态机、边界处理、系统架构
      【设计维度】
      - 操作流程：玩家如何进入、操作、退出该养成系统
      - 解锁条件：等级门槛、前置任务、引导流程
      - 状态流转：养成对象的状态变化（未解锁→可养成→已满级等）
      - 边界与异常：上限处理、资源不足、冲突规则
      
      使用 wiki_lookup 查询相关系统文档，使用 kg_query 查询系统间依赖关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-002"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      经济循环设计（产出-消耗）: {requirement}
      
      【能力要求】经济平衡、产出消耗分析
      【设计维度】
      - 消耗什么材料：养成所需的资源类型、数量公式
      - 从哪获取：材料产出途径（副本、商店、活动等）
      - 产出上限：单日/单周获取上限
      - 资源闭环：该养成线与整体经济系统的关系
      
      【边界约束】经济循环必须闭环：有产出（Source）就有消耗（Sink）
      
      使用 wiki_relations 查询材料的产出与消耗关系，使用 wiki_table_refs 查看相关配表。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-003"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      成长曲线设计: {requirement}
      
      【能力要求】成长曲线、公式设计、经济平衡
      【设计维度】
      - 成长公式：属性随等级/星级的增长公式
      - 战力计算：该养成线对战力的贡献权重
      - 收益曲线：投入产出比、边际收益递减设计
      - 瓶颈节奏：哪些节点需要玩家停留（材料瓶颈、等级墙）
      
      【边界约束】数值设计预留扩展空间，避免数值膨胀不可控
      
      基于 TASK-001、TASK-002 的产出（使用 workspace_read 读取），设计数值模型。
      使用 table_list 查看相关配表，使用 table_copy_to_workspace 复制到 workspace 进行修改。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-004"
    domain: "GAMEPLAY_DESIGN"
    requirement: |
      玩法体验设计: {requirement}
      
      【能力要求】玩法原型、UI 流程、操作反馈
      【设计维度】
      - 操作反馈：点击、拖拽、长按等交互的即时反馈
      - 爽感节点：突破成功、满级、解锁新能力等高光时刻
      - 阶段目标感：短期目标（今日）、中期目标（本周）、长期目标（赛季）
      
      基于 TASK-001 的系统规则（使用 workspace_read 读取），设计界面流程和交互体验。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "gameplay_design_output.md"
    
  - taskId: "TASK-005"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      商业化关联设计: {requirement}
      
      【能力要求】付费设计、投放策略
      【设计维度】
      - 是否有付费加速：时间加速、跳过等待、批量操作
      - 是否有付费专属：专属养成线、专属材料、专属外观
      - 免费与付费的成长差距：差距控制在多少倍、追赶机制
      
      基于 TASK-002、TASK-003 的产出（使用 workspace_read 读取），设计付费点和定价策略。
    dependencies:
      - "TASK-002"
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-006"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      使用 workspace_list 和 workspace_read 读取 TASK-001 ~ TASK-005 的全部产出。
      
      【审阅清单】
      - 五大维度是否完整覆盖
      - 系统规则与数值模型是否一致
      - 产销关系是否闭环
      - 付费设计是否符合商业化目标
      - 配表文件使用 table_validate 校验
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
      - "TASK-005"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 养成系统策划工作流

严格按照主策划提供的《文档分类 — 设计关注点清单》中的"A. 养成系统"五大维度拆分任务。

## 执行顺序

```
TASK-001 (系统规则)
    │
    ├──→ TASK-002 (产销关系)
    │       │
    │       └──→ TASK-003 (数值模型) ──→ TASK-005 (商业化关联)
    │                                        │
    └──→ TASK-004 (玩法体验) ────────────────┴──→ TASK-006 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应维度 |
|------|--------|---------|
| TASK-001 | 系统规则文档 | 系统规则 |
| TASK-002 | 产销关系文档 | 产销关系 |
| TASK-003 | 数值模型文档 + 配表 | 数值模型 |
| TASK-004 | 玩法体验文档 | 玩法体验 |
| TASK-005 | 商业化方案文档 | 商业化关联 |
| TASK-006 | QA 审阅报告 | 通用维度 |

## 设计原则

- **忠实度优先**：严格按五大维度拆分，不遗漏任何维度
- **允许发散**：在不违背关键边界（数值模型、产销闭环）的前提下，可以有创意发挥
- **SubAgent 匹配**：每个任务的 requirement 中明确标注所需能力，便于 Router 精准分配
