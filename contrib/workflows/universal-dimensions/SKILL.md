---
name: "universal_dimensions"
description: "通用维度工作流 — 覆盖配表需求、跨系统影响、前端表现、数据埋点四大通用维度，适用于所有功能设计"
keywords:
  - "配表"
  - "跨系统"
  - "前端"
  - "UI"
  - "埋点"
  - "数据"
  - "影响分析"
  - "依赖"
tasks:
  - taskId: "TASK-001"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      配表需求分析: {requirement}
      
      【能力要求】配表填写、数据校验、内容落地、枚举定义
      【设计维度】
      - 需要哪些配置表：列出所有涉及的配表名称
      - 字段定义：每个表的字段名、类型、取值范围、默认值
      - 枚举值：需要定义哪些枚举类型（状态、类型、品质等）
      
      使用 wiki_table_refs 查询相关文档引用的配表，使用 table_list 查看知识库中已有的配表分类。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-002"
    domain: "SYSTEM_DESIGN"
    requirement: |
      跨系统影响分析: {requirement}
      
      【能力要求】系统架构、规则设计
      【设计维度】
      - 该设计影响哪些其他系统：列出所有受影响的系统
      - 该设计依赖哪些其他系统：列出所有前置依赖
      - 数据流向：数据如何在系统间流转
      - 冲突处理：与现有系统的冲突点及解决方案
      
      使用 kg_query 查询系统间的依赖关系，使用 wiki_relations 查询实体间的关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
    
  - taskId: "TASK-003"
    domain: "GAMEPLAY_DESIGN"
    requirement: |
      前端表现设计: {requirement}
      
      【能力要求】UI 流程、操作反馈、界面规范、动效需求
      【设计维度】
      - 界面流转：页面跳转流程、返回逻辑
      - 操作反馈：点击、拖拽、长按等交互的即时反馈
      - 动画/特效需求：入场动画、过渡动画、特效表现
      - 界面规范：布局、字体、颜色、图标等规范
      
      基于 TASK-001、TASK-002 的产出（使用 workspace_read 读取），设计前端表现方案。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "DOCUMENT"
    outputTemplate: "gameplay_design_output.md"
    
  - taskId: "TASK-004"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      数据埋点设计: {requirement}
      
      【能力要求】数据分析、留存模型
      【设计维度】
      - 需要跟踪的关键指标：DAU、留存、付费、转化等
      - 事件定义：事件名称、触发时机、上报参数
      - 漏斗分析：关键路径的转化漏斗
      - 数据用途：这些数据用于什么决策
      
      基于 TASK-001、TASK-002、TASK-003 的产出（使用 workspace_read 读取），设计埋点方案。
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
    
  - taskId: "TASK-005"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      使用 workspace_list 和 workspace_read 读取 TASK-001 ~ TASK-004 的全部产出。
      
      【审阅清单】
      - 四大通用维度是否完整覆盖
      - 配表定义是否清晰无歧义
      - 跨系统影响是否分析完整
      - 前端表现是否可实现
      - 数据埋点是否覆盖关键指标
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
      - "TASK-004"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 通用维度工作流

严格按照主策划提供的《文档分类 — 设计关注点清单》中的"通用维度"四大维度拆分任务。

## 执行顺序

```
TASK-001 (配表需求) ──┐
                      ├──→ TASK-003 (前端表现) ──→ TASK-004 (数据埋点)
TASK-002 (跨系统影响) ┘                              │
                                                     └──→ TASK-005 (QA 审阅)
```

## 关键交付物

| 任务 | 交付物 | 对应维度 |
|------|--------|---------|
| TASK-001 | 配表需求文档 | 配表需求 |
| TASK-002 | 跨系统影响分析 | 跨系统影响 |
| TASK-003 | 前端表现方案 | 前端表现 |
| TASK-004 | 数据埋点方案 | 数据埋点 |
| TASK-005 | QA 审阅报告 | - |

## 使用场景

- 作为其他 workflow 的补充维度
- 单独使用时，适用于技术方案设计、影响分析等场景
- 可与养成系统、玩法活动、运营活动等 workflow 组合使用
