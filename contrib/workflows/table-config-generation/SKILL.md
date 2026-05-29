---
name: "table-config-generation"
description: "配表生成工作流 — 专注于配置表的查询、创建、修改与校验，由数值策划主导，QA最终校验"
keywords:
  - "配表"
  - "配置"
  - "表格"
  - "xlsx"
  - "数值"
  - "属性"
  - "参数"
  - "调整"
  - "修改配置"
  - "新增配置"
  - "table"
  - "config"
tasks:
  - taskId: "TASK-001"
    domain: "NUMERICAL_PLANNING"
    requirement: |
      配表任务: {requirement}
      
      请按以下步骤操作：
      1. 使用 table_list 查看相关知识库中已有的配表分类
      2. 使用 table_read 查看相关配表的结构和数据
      3. 使用 table_copy_to_workspace 将需要修改的表复制到 workspace
      4. 在 workspace 副本上进行修改（table_write / table_write_headers / table_add_sheet）
      5. 使用 table_validate 校验修改后的配表
      6. 使用 workspace_write 写入设计文档（output.md），说明修改了哪些表、哪些字段
    dependencies: []
    outputType: "CONFIG_TABLE"
    outputTemplate: "numerical_plan_output.md"
  - taskId: "TASK-002"
    domain: "QA"
    requirement: |
      QA 审阅: {requirement}
      
      请对 TASK-001 的配表产出进行校验：
      1. 使用 workspace_read 读取 TASK-001 的 output.md
      2. 使用 table_validate 对所有 .xlsx 配表文件进行格式校验
      3. 使用 table_read 抽查 3-5 行数据，确认字段值在取值范围内
      4. 使用 table_query 按条件查询，验证外键引用的目标存在
      5. 生成审阅报告（output.md + issues.json）
    dependencies:
      - "TASK-001"
    outputType: "DOCUMENT"
    outputTemplate: "final_plan_output.md"
---
# 配表生成工作流

专注于配置表操作的工作流，由数值策划主导配表操作，QA 进行最终校验。

## 执行顺序

```
TASK-001 (数值策划: 配表创建/修改)
    │
    └──→ TASK-002 (QA: 配表校验 + 审阅)
```

## 配表操作规范

TASK-001 必须严格遵循 copy-on-write 原则：
1. `table_list` → 发现目标表
2. `table_read` → 查看现状
3. `table_copy_to_workspace` → 复制到 workspace
4. 修改 workspace 副本
5. `table_validate` → 自校验

## 关键交付物

| 任务 | 交付物 | 说明 |
|------|--------|------|
| TASK-001 | output.md + *.xlsx | 配表设计文档 + 实际配表文件 |
| TASK-002 | output.md + issues.json | 审阅报告 + 问题清单 |

## 注意事项

- 所有配表操作在 workspace 中进行，绝不修改原始文件
- table_validate 是最后防线，TASK-002 必须执行
- 如果需求不明确，先向用户确认再操作
