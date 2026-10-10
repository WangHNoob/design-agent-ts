# 意图分类评测（design/table 闲聊快路径）

评测 `IntentClassifier` 的 chat/task 二分类效果。方案背景、逐轮迭代、错例分析与面试问答见
[ITERATION_LOG.md](./ITERATION_LOG.md)。

## 运行

```bash
# 全量（77 例，约 2 分钟，直连 .env 配置的真实模型）
npx tsx --env-file=.env eval/intent/run-eval.ts --tag v3-final

# 冒烟（只跑前 4 例，验证脚本连通性）
npx tsx --env-file=.env eval/intent/run-eval.ts --tag smoke --limit 4

# 换 prompt 实验（不动线上文件）
npx tsx --env-file=.env eval/intent/run-eval.ts --tag v4-experiment --prompt /tmp/intent_v4.md --concurrency 4
```

参数：`--tag` 轮次标识（进报告文件名）、`--limit N` 冒烟、`--concurrency N`（默认 4）、
`--prompt <path>`（默认 `prompts/intent_classify.md`）、`--set <path>`（默认 `eval/intent/golden-set.json`）。

## 黄金集格式（golden-set.json）

```json
{
  "version": "v1",
  "cases": [
    {
      "id": "adv-chat-001",          // 唯一 ID
      "category": "adversarial_chat_lookalike",  // 类别，报告按类聚合
      "expect": "task",              // 黄金标签：chat | task
      "requirement": "你好，帮我设计一个签到系统",
      "history": [ ... ],            // 可选，多轮上下文（模糊延续词用例必备）
      "note": "标注理由（可选）"
    }
  ]
}
```

标注口径（见集合 description）：凡需要检索平台知识库、产出策划文档/配置表、或延续既有任务产出的
一律 `task`；寒暄/能力询问/纯附和/不依赖平台知识库的轻量问答与点子 → `chat`。口径是产品决策，
先于 prompt 定标，修改口径要在 ITERATION_LOG.md 记录理由。

## 指标口径

| 指标 | 含义 | 目标 |
|---|---|---|
| 总体准确率 | correct / total | 越高越好 |
| **误吞 task→chat** | 真实任务被直答吃掉（**危险**） | **0 容忍** |
| 漏判 chat→task | 闲聊走了规划（安全方向，功能退化） | 逐例分析即可 |
| 延迟 p50/p95 | 单例分类耗时 | p50 < 1.5s；线上另有 3s 超时兜底 |
| LLM 调用次数 | 含结构化重试 | ≈ 用例数（重试多说明输出不稳定） |
| 输出 token/例 | 成本参考 | —（输入 token 网关不回传，暂缺） |

## 报告

每次运行落盘 `reports/run-<时间戳>-<tag>.json`：总体/分类别准确率、混淆双向计数、延迟分位、
token 统计、**逐例结果（含错例的原句）**、`promptHash`（prompt sha256 前 12 位，与
ITERATION_LOG.md 的迭代表对应，保证"哪版 prompt 跑出的分数"可追溯）。

## 约定

- 评测集新增用例时同步在 ITERATION_LOG.md 记一行（来源：人工构造 / 线上抽样 / 误判回流）。
- 线上发现的误判，先回流进 golden-set.json（带 `note` 标注来源），再修 prompt，再全量回归。
- `reports/` 下的历史报告保留不删，作为迭代证据链。
