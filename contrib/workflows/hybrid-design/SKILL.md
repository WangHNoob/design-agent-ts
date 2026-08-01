---
name: "hybrid-design"
description: "混合型工作流 — 当功能跨多个分类时（如赛季战令=玩法活动+运营活动），合并对应分类的维度"
keywords:
  - "混合"
  - "赛季"
  - "战令"
  - "寻宝"
  - "付费养成"
  - "跨分类"
tasks:
  - taskId: "TASK-001"
    domain: "SYSTEM_DESIGN"
    requirement: |
      分类识别与维度合并: {requirement}
      
      【能力要求】系统架构、规则设计
      【任务目标】
      1. 识别该需求涉及哪些分类（养成系统 A / 玩法活动 B / 运营活动 C）
      2. 从 doc_modules.md 中提取对应分类的所有维度
      3. 合并维度清单，去重，生成完整的设计维度列表
      4. 输出维度清单到 workspace（dimensions.json）
      
      使用 wiki_lookup 查询相关文档，使用 kb_get_neighbors 分析系统间关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-002"
    domain: "SYSTEM_DESIGN"
    requirement: |
      系统规则设计（养成系统维度）: {requirement}
      
      【能力要求】规则设计、流程设计、状态机、边界处理
      【设计维度】操作流程、解锁条件、状态流转、边界与异常
      
      基于 TASK-001 的维度清单（使用 workspace_read 读取 dimensions.json），
      如果包含养成系统维度，则设计系统规则。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-003"
    domain: "GAMEPLAY_DESIGN"
    requirement: |
      玩法规则设计（玩法活动维度）: {requirement}
      
      【能力要求】关卡设计、战斗体验、玩法原型
      【设计维度】参与条件、操作流程、胜负/结算逻辑
      
      基于 TASK-001 的维度清单（使用 workspace_read 读取 dimensions.json），
      如果包含玩法活动维度，则设计玩法规则。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "gameplay_design_output.md"
    
  - taskId: "TASK-004"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      数值模型设计（养成系统维度）: {requirement}
      
      【能力要求】公式设计、成长曲线、经济平衡
      【设计维度】成长公式、战力计算、收益曲线、瓶颈节奏
      
      基于 TASK-002 的系统规则（使用 workspace_read 读取），
      如果包含养成系统维度，则设计数值模型。
    dependencies:
      - "TASK-002"
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-005"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      奖励投放设计（玩法活动维度）: {requirement}
      
      【能力要求】经济平衡、产销分析
      【设计维度】奖励类型与数量、阶梯设计、保底、与经济的关系
      
      基于 TASK-003 的玩法规则（使用 workspace_read 读取），
      如果包含玩法活动维度，则设计奖励投放。
    dependencies:
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-006"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      付费设计（运营活动维度）: {requirement}
      
      【能力要求】付费设计、数据分析
      【设计维度】触发场景、心理驱动、付费深度分层
      
      基于 TASK-001 的维度清单（使用 workspace_read 读取 dimensions.json），
      如果包含运营活动维度，则设计付费方案。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-007"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      定价策略设计（运营活动维度）: {requirement}
      
      【能力要求】经济平衡、产销分析
      【设计维度】价格梯度、锚定效应、免费 vs 付费差距
      
      基于 TASK-006 的付费设计（使用 workspace_read 读取），
      如果包含运营活动维度，则设计定价策略。
    dependencies:
      - "TASK-006"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-008"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      投放节奏设计（玩法活动 + 运营活动维度）: {requirement}
      
      【能力要求】活动节奏、投放策略
      【设计维度】时间窗口、刷新周期、与版本计划配合、避免疲劳、合规要求
      
      基于 TASK-003、TASK-005、TASK-006、TASK-007 的产出（使用 workspace_read 读取），
      设计投放时间表。
    dependencies:
      - "TASK-003"
      - "TASK-005"
      - "TASK-006"
      - "TASK-007"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-009"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      使用 workspace_list 和 workspace_read 读取所有任务的产出。
      
      【审阅清单】
      - 所有涉及分类的维度是否完整覆盖
      - 不同分类的维度之间是否协调一致
      - 养成系统 + 玩法活动 + 运营活动的组合是否合理
      - 配表文件使用 table_validate 校验
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
      - "TASK-005"
      - "TASK-006"
      - "TASK-007"
      - "TASK-008"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 混合型工作流

当功能跨多个分类时，合并对应分类的维度。

## 典型场景

| 功能 | 涉及分类 | 合并维度 |
|------|---------|---------|
| 赛季战令 | B + C | 玩法规则 + 奖励投放 + 付费设计 + 定价策略 + 投放节奏 |
| 限时寻宝 | B + C | 玩法规则 + 奖励投放 + 概率与保底 + 付费设计 |
| 付费养成线 | A + C | 系统规则 + 数值模型 + 付费设计 + 定价策略 |

## 执行顺序

```
TASK-001 (分类识别与维度合并)
    │
    ├──→ TASK-002 (系统规则) ──→ TASK-004 (数值模型)
    │                                │
    ├──→ TASK-003 (玩法规则) ──→ TASK-005 (奖励投放) ──→ TASK-008 (投放节奏)
    │                                                        │
    └──→ TASK-006 (付费设计) ──→ TASK-007 (定价策略) ───────┴──→ TASK-009 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应分类 |
|------|--------|---------|
| TASK-001 | 维度清单 (dimensions.json) | - |
| TASK-002 | 系统规则文档 | A (养成系统) |
| TASK-003 | 玩法规则文档 | B (玩法活动) |
| TASK-004 | 数值模型文档 + 配表 | A (养成系统) |
| TASK-005 | 奖励投放方案 | B (玩法活动) |
| TASK-006 | 付费设计文档 | C (运营活动) |
| TASK-007 | 定价策略文档 | C (运营活动) |
| TASK-008 | 投放时间表 | B + C |
| TASK-009 | QA 审阅报告 | - |

## 设计原则

- **动态组合**：TASK-001 根据需求动态识别涉及的分类，后续任务根据维度清单决定是否执行
- **维度完整**：确保所有涉及分类的维度都被覆盖
- **协调一致**：不同分类的维度之间要协调，避免冲突（如养成节奏与付费节奏的冲突）
- **SubAgent 匹配**：每个任务明确标注所需能力，便于精准分配