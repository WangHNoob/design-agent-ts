---
name: "operation-activity"
description: "运营活动策划工作流 — 覆盖付费设计、定价策略、概率与保底、投放节奏、留存目标五大维度"
keywords:
  - "运营"
  - "抽卡"
  - "礼包"
  - "签到"
  - "回流"
  - "促销"
  - "充值"
  - "付费"
  - "商城"
  - "卡池"
tasks:
  - taskId: "TASK-001"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      付费设计: {requirement}
      
      【能力要求】付费设计、数据分析
      【设计维度】
      - 触发场景：在什么情况下向玩家展示付费入口（新手引导、资源不足、节日等）
      - 心理驱动：利用什么心理机制（稀缺性、锚定效应、损失厌恶、社交炫耀）
      - 付费深度分层：小R（6-30元）、中R（98-328元）、大R（648+元）的不同付费点
      
      使用 wiki_lookup 查询相关运营活动文档，使用 kb_get_neighbors 查询付费点与系统的关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-002"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      定价策略设计: {requirement}
      
      【能力要求】经济平衡、产销分析
      【设计维度】
      - 价格梯度：6元、18元、30元、68元、98元、198元、328元、648元等档位设计
      - 锚定效应：如何通过高价档位衬托中价档位的"性价比"
      - 免费 vs 付费差距：付费玩家比免费玩家快多少、强多少
      
      基于 TASK-001 的付费设计（使用 workspace_read 读取），设计价格体系。
      使用 kb_get_relations 查询付费道具的价值评估。
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-003"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      概率模型与保底设计: {requirement}
      
      【能力要求】概率模型、公式设计
      【设计维度】
      - 抽卡概率：SSR 1%、SR 10%、R 89% 等概率分布
      - 保底规则：多少抽必出 SSR、大保底与小保底
      - 概率公示：如何向玩家展示概率（符合法规要求）
      
      【边界约束】运营活动标注合规要求（概率公示、未成年保护）
      
      基于 TASK-001 的付费设计（使用 workspace_read 读取），设计概率模型。
      使用 kb_list_tables 查看是否有抽卡配表可参考，使用 table_copy_to_workspace 复制到 workspace 进行修改。
    dependencies:
      - "TASK-001"
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
    
  - taskId: "TASK-004"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      投放节奏设计: {requirement}
      
      【能力要求】活动节奏、投放策略、数据分析
      【设计维度】
      - 与版本/玩法活动配合：在版本生命周期中的位置
      - 避免疲劳：不能让玩家感到"天天都在促销"
      - 合规要求：符合地区法规（概率公示、未成年人保护等）
      
      基于 TASK-001、TASK-002、TASK-003 的产出（使用 workspace_read 读取），设计投放时间表。
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-005"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      留存目标设计: {requirement}
      
      【能力要求】数据分析、留存模型
      【设计维度】
      - 拉新：新用户首充优惠、新手礼包
      - 促活：日常签到、活跃度奖励
      - 回流：流失召回礼包、老玩家专属福利
      - 付费转化：从免费到首充、从小R到中R的转化路径
      - 对应哪个数据指标：次留、7留、30留、ARPU、ARPPU、付费率等
      
      基于 TASK-001、TASK-004 的产出（使用 workspace_read 读取），设计留存策略。
    dependencies:
      - "TASK-001"
      - "TASK-004"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-006"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      使用 workspace_list 和 workspace_read 读取 TASK-001 ~ TASK-005 的全部产出。
      
      【审阅清单】
      - 五大维度是否完整覆盖
      - 付费设计是否符合心理学原理
      - 定价策略是否合理
      - 概率与保底是否符合法规
      - 投放节奏是否避免疲劳
      - 留存目标是否明确可衡量
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
# 运营活动策划工作流

严格按照主策划提供的《文档分类 — 设计关注点清单》中的"C. 运营活动"五大维度拆分任务。

## 执行顺序

```
TASK-001 (付费设计)
    │
    ├──→ TASK-002 (定价策略) ──→ TASK-004 (投放节奏) ──→ TASK-005 (留存目标)
    │                                                          │
    └──→ TASK-003 (概率与保底) ────────────────────────────────┴──→ TASK-006 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应维度 |
|------|--------|---------|
| TASK-001 | 付费设计文档 | 付费设计 |
| TASK-002 | 定价策略文档 | 定价策略 |
| TASK-003 | 概率模型文档 + 配表 | 概率与保底 |
| TASK-004 | 投放时间表 | 投放节奏 |
| TASK-005 | 留存策略文档 | 留存目标 |
| TASK-006 | QA 审阅报告 | 通用维度 |

## 设计原则

- **数据驱动**：运营活动以数据指标为核心，留存目标优先
- **合规第一**：概率公示、未成年人保护等法规要求必须满足
- **心理学应用**：付费设计要基于心理学原理，不能靠"拍脑袋"
- **SubAgent 匹配**：每个任务明确标注所需能力，便于精准分配
