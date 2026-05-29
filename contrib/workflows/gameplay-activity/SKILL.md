---
name: "gameplay-activity"
description: "玩法活动策划工作流 — 覆盖玩法规则、奖励投放、活动节奏、复用框架、商业化关联五大维度"
keywords:
  - "活动"
  - "玩法"
  - "副本"
  - "赛季"
  - "限时"
  - "模式"
  - "挑战"
  - "竞技"
  - "PVE"
  - "PVP"
tasks:
  - taskId: "TASK-001"
    domain: "GAMEPLAY_DESIGN"
    requirement: |
      核心玩法循环设计: {requirement}
      
      【能力要求】玩法原型、核心玩法循环、难度曲线
      【设计维度】
      - 参与条件：等级门槛、消耗道具、次数限制
      - 操作流程：进入→战斗/操作→结算的完整流程
      - 胜负/结算逻辑：胜利条件、失败条件、评分规则
      - 核心循环：玩家重复进行的核心操作链
      
      【边界约束】养成和玩法都必须考虑商业化关联
      
      使用 wiki_lookup 查询相关玩法文档，使用 kg_query 查询玩法间的关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "gameplay_design_output.md"
    
  - taskId: "TASK-002"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      奖励投放设计: {requirement}
      
      【能力要求】经济平衡、产销分析
      【设计维度】
      - 奖励类型与数量：货币、材料、道具、角色碎片等
      - 阶梯设计：首通奖励、排名奖励、积分奖励
      - 保底机制：最低保障、参与奖
      - 与经济的关系：该活动对整体经济的影响（通胀风险、材料产出占比）
      
      基于 TASK-001 的玩法规则（使用 workspace_read 读取），设计奖励方案。
      使用 wiki_relations 查询奖励物品的产出与消耗关系。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-003"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      活动节奏设计: {requirement}
      
      【能力要求】活动节奏、投放策略
      【设计维度】
      - 时间窗口：活动持续时长、每日开放时段
      - 刷新周期：每日刷新、每周刷新、赛季刷新
      - 与版本计划配合：在版本生命周期中的位置（开服活动、版本中期、版本末期）
      
      基于 TASK-001、TASK-002 的产出（使用 workspace_read 读取），设计活动时间表。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-004"
    domain: "SYSTEM_DESIGN"
    requirement: |
      复用框架设计: {requirement}
      
      【能力要求】系统架构、规则设计
      【设计维度】
      - 哪些规则固定：核心玩法逻辑、结算规则
      - 哪些参数可配置：敌人配置、地图配置、奖励配置
      - 换皮成本：复用该框架推出新活动的工作量评估
      
      基于 TASK-001 的玩法规则（使用 workspace_read 读取），抽象出可复用的框架。
      使用 table_list 查看是否有类似活动的配表可参考。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-005"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      商业化关联设计: {requirement}
      
      【能力要求】付费设计、投放策略
      【设计维度】
      - 是否有付费入场：门票、特权卡
      - 是否有付费奖励：付费档位、额外奖励
      - 玩法内的消费触点：复活、加速、购买挑战次数
      
      基于 TASK-002、TASK-003 的产出（使用 workspace_read 读取），设计付费点。
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
      - 玩法规则是否清晰无歧义
      - 奖励投放是否符合经济平衡
      - 活动节奏是否合理
      - 复用框架是否可行
      - 付费设计是否符合商业化目标
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
      - "TASK-005"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 玩法活动策划工作流

## 执行顺序

```
TASK-001 (玩法规则)
    │
    ├──→ TASK-002 (奖励投放) ──→ TASK-003 (活动节奏) ──→ TASK-005 (商业化关联)
    │                                                          │
    └──→ TASK-004 (复用框架) ──────────────────────────────────┴──→ TASK-006 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应维度 |
|------|--------|---------|
| TASK-001 | 玩法规则文档 | 玩法规则 |
| TASK-002 | 奖励投放方案 | 奖励投放 |
| TASK-003 | 活动时间表 | 活动节奏 |
| TASK-004 | 复用框架文档 | 复用框架 |
| TASK-005 | 商业化方案 | 商业化关联 |
| TASK-006 | QA 审阅报告 | 通用维度 |

## 设计原则

- **体验驱动**：玩法活动以玩家体验为核心，规则设计优先
- **经济平衡**：奖励投放必须考虑对整体经济的影响
- **可复用性**：框架设计要考虑后续换皮成本
- **SubAgent 匹配**：每个任务明确标注所需能力，便于精准分配
