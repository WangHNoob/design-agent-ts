---
name: "default_design"
description: "通用游戏策划工作流，由人为定义固定任务结构，供 DirectorAgent 选择使用"
keywords:
  - "游戏"
  - "策划"
  - "设计"
  - "系统"
  - "玩法"
tasks:
  - taskId: "TASK-001"
    domain: "SYSTEM_DESIGN"
    requirement: |
      系统设计: {requirement}
      
      【能力要求】规则设计、流程设计、状态机、边界处理、系统架构
      使用 wiki_lookup 查询相关系统文档，使用 kg_query 查询系统间依赖关系。
    dependencies: []
    outputType: "DOCUMENT"
    outputTemplate: "system_design_output.md"
  - taskId: "TASK-002"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      数值规划: {requirement}
      
      【能力要求】公式设计、成长曲线、经济平衡、产销分析
      基于 TASK-001 的系统设计（使用 workspace_read 读取），设计数值模型。
      使用 table_list 查看相关配表，使用 table_copy_to_workspace 复制到 workspace 进行修改。
    dependencies: []
    outputType: "MIXED"
    outputTemplate: "numerical_plan_output.md"
  - taskId: "TASK-003"
    domain: "EXECUTIVE_PLANNING"
    requirement: |
      执行规划: {requirement}

      【能力要求】开发排期、里程碑规划、资源估算、风险识别、交付计划
      基于 TASK-001 系统设计和 TASK-002 数值规划，制定开发执行计划。
      使用 workspace_read 读取前序任务产出。
    dependencies:
      - "TASK-001"
      - "TASK-002"
    outputType: "DOCUMENT"
    outputTemplate: "executive_plan_output.md"
  - taskId: "TASK-004"
    domain: "QA"
    requirement: "QA 校验: {requirement}"
    dependencies:
      - "TASK-001"
      - "TASK-002"
      - "TASK-003"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---

# Default Design Workflow

这个 workflow 只定义主 Agent 的固定任务结构。
DirectorAgent 可以根据关键词匹配该流程，但不允许 LLM 擅自修改 taskId、domain、dependencies 和 outputTemplate。
