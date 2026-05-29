---
name: "knowledge-query"
description: "供子 Agent 读取的知识查询 skill，约束其优先使用知识库与工具而不是自由发挥"
---

# Knowledge Query Skill

使用本 skill 时：

1. 优先使用 `KnowledgeGraphTool` 获取结构化关系。
2. 再使用 `GrepSearchTool` 检索 `knowledge/wiki/*.md`。
3. 无法找到来源时必须明确标注 `无知识库参考`。
4. 不得虚构世界观、系统规则或配置表字段。
