---
name: "knowledge-query"
description: "供子 Agent 读取的知识查询 skill，约束其优先使用知识库与工具而不是自由发挥"
---

# Knowledge Query Skill

使用本 skill 时：

1. 优先使用 Knowledge Hub MCP 工具（`kb_search` → `kb_get_page` / `kb_get_entity` / `kb_query_table`）。
2. kb_* 不可用或 miss 时，再用本地 `wiki_lookup` / `wiki_read` / `kg_query_*` / `grep_search`。
3. 无法找到来源时必须明确标注 `无知识库参考`，并由运行时自动 `kb_report_gap`。
4. 不得虚构世界观、系统规则或配置表字段；文末标注可信度与证据。
