'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  Plus,
  Trash2,
  Save,
  FilePlus,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Loader2,
  X,
  GripVertical,
  CheckCircle2,
  Layers,
  Tag,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import SettingsNav from '@/components/SettingsNav';
import {
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  llmGenerateWorkflowContent,
  validateWorkflow,
  type WorkflowTaskDef,
  type WorkflowInfo,
} from '@/lib/api';

// ── Constants ────────────────────────────────────────────────

const DOMAIN_OPTIONS = [
  { value: 'system_design', label: '系统设计' },
  { value: 'combat_design', label: '战斗设计' },
  { value: 'numerical_planning', label: '数值策划' },
  { value: 'gameplay_design', label: '玩法设计' },
  { value: 'executive_planning', label: '执行策划' },
  { value: 'qa', label: 'QA 测试' },
];

const OUTPUT_TYPE_OPTIONS = [
  { value: 'DOCUMENT', label: '文档' },
  { value: 'CONFIG_TABLE', label: '配置表' },
  { value: 'MIXED', label: '混合' },
];

function nextTaskId(tasks: WorkflowTaskDef[]): string {
  const maxNum = tasks.reduce((max, t) => {
    const m = t.taskId.match(/^TASK-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return `TASK-${String(maxNum + 1).padStart(3, '0')}`;
}

function emptyTask(tasks: WorkflowTaskDef[]): WorkflowTaskDef {
  return {
    taskId: nextTaskId(tasks),
    domain: 'system_design',
    requirement: '',
    dependencies: [],
    outputType: 'DOCUMENT',
    outputTemplate: '',
  };
}

interface FormState {
  name: string;
  description: string;
  keywords: string[];
  tasks: WorkflowTaskDef[];
}

function emptyForm(): FormState {
  return { name: '', description: '', keywords: [], tasks: [] };
}

interface ValidationErrors {
  name?: string;
  description?: string;
  tasks?: Record<number, Record<string, string>>;
  general?: string[];
}

// ── Page Component ───────────────────────────────────────────

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [originalForm, setOriginalForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<unknown>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [perTaskAiLoading, setPerTaskAiLoading] = useState<Record<number, boolean>>({});

  // Keyword input
  const [keywordInput, setKeywordInput] = useState('');
  const keywordRef = useRef<HTMLInputElement>(null);

  // ── Load workflow list ──────────────────────────────────

  const loadList = useCallback(async () => {
    try {
      const data = await listWorkflows();
      setWorkflows(data.workflows);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadList();
      setLoading(false);
    };
    init();
  }, [loadList]);

  // ── Select workflow ─────────────────────────────────────

  const selectWorkflow = async (name: string) => {
    setErrors({});
    setSaveSuccess(false);
    setAiResult(null);
    setAiError(null);
    try {
      const detail = await getWorkflow(name);
      const f: FormState = {
        name: detail.name,
        description: detail.description,
        keywords: [...detail.keywords],
        tasks: detail.tasks.map((t) => ({ ...t, dependencies: [...t.dependencies] })),
      };
      setForm(f);
      setOriginalForm(f);
      setSelectedName(name);
    } catch {
      setErrors({ general: ['加载工作流失败'] });
    }
  };

  // ── New workflow ────────────────────────────────────────

  const handleNew = () => {
    const f = emptyForm();
    setForm(f);
    setOriginalForm(f);
    setSelectedName(null);
    setErrors({});
    setSaveSuccess(false);
    setAiResult(null);
    setAiError(null);
  };

  // ── Save ────────────────────────────────────────────────

  const handleSave = async () => {
    const errs: ValidationErrors = {};

    if (!form.name.trim()) errs.name = '名称不能为空';
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.name))
      errs.name = '名称必须为 kebab-case（如 rpg-character-system）';

    if (!form.description.trim()) errs.description = '描述不能为空';

    const taskErrors: Record<number, Record<string, string>> = {};
    form.tasks.forEach((t, i) => {
      const te: Record<string, string> = {};
      if (!t.requirement.trim()) te.requirement = '需求模板不能为空';
      if (!t.outputTemplate.trim()) te.outputTemplate = '输出模板不能为空';
      if (Object.keys(te).length) taskErrors[i] = te;
    });
    if (Object.keys(taskErrors).length) errs.tasks = taskErrors;

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setErrors({});

    // Server-side validation before saving
    try {
      const contentStr = JSON.stringify({
        name: form.name,
        description: form.description,
        keywords: form.keywords,
        tasks: form.tasks,
      });
      const validation = await validateWorkflow(contentStr);
      if (!validation.valid && validation.errors?.length) {
        setErrors({ general: validation.errors });
        setSaving(false);
        return;
      }
    } catch {
      // If validation endpoint is unavailable, proceed with save
    }

    try {
      const result = await saveWorkflow(form.name, {
        name: form.name,
        description: form.description,
        keywords: form.keywords,
        tasks: form.tasks,
      });
      if (result.errors?.length) {
        setErrors({ general: result.errors });
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        await loadList();
        setSelectedName(form.name);
        setOriginalForm({ ...form });
      }
    } catch {
      setErrors({ general: ['保存失败，请检查后端连接'] });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────

  const handleDelete = async () => {
    if (!selectedName) return;
    if (!confirm(`确定要删除工作流「${selectedName}」吗？此操作不可撤销。`)) return;

    setDeleting(true);
    try {
      await deleteWorkflow(selectedName);
      await loadList();
      handleNew();
    } catch {
      setErrors({ general: ['删除失败'] });
    } finally {
      setDeleting(false);
    }
  };

  // ── AI Generate (whole workflow) ────────────────────────

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res = await llmGenerateWorkflowContent(aiPrompt);
      if (res.success) {
        setAiResult(res.data);
      } else {
        setAiError(res.raw || '生成失败');
      }
    } catch {
      setAiError('AI 生成请求失败，请检查后端连接');
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAiResult = () => {
    if (!aiResult || typeof aiResult !== 'object') return;
    const data = aiResult as Record<string, unknown>;
    const newForm: FormState = { ...form };
    if (typeof data.name === 'string') newForm.name = data.name;
    if (typeof data.description === 'string') newForm.description = data.description;
    if (Array.isArray(data.keywords)) newForm.keywords = data.keywords.filter((k): k is string => typeof k === 'string');
    if (Array.isArray(data.tasks)) {
      newForm.tasks = data.tasks
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
        .map((t, i) => ({
          taskId: typeof t.taskId === 'string' ? t.taskId : `TASK-${String(i + 1).padStart(3, '0')}`,
          domain: typeof t.domain === 'string' ? t.domain : 'system_design',
          requirement: typeof t.requirement === 'string' ? t.requirement : '',
          dependencies: Array.isArray(t.dependencies) ? t.dependencies.filter((d): d is string => typeof d === 'string') : [],
          outputType: typeof t.outputType === 'string' ? t.outputType : 'DOCUMENT',
          outputTemplate: typeof t.outputTemplate === 'string' ? t.outputTemplate : '',
        }));
    }
    setForm(newForm);
    setAiResult(null);
  };

  // ── AI Generate (per-task requirement) ──────────────────

  const handleTaskAiGenerate = async (index: number) => {
    const task = form.tasks[index];
    if (!task) return;
    setPerTaskAiLoading((prev) => ({ ...prev, [index]: true }));
    try {
      const domainLabel = DOMAIN_OPTIONS.find((d) => d.value === task.domain)?.label || task.domain;
      const prompt = `为游戏设计工作流生成一段任务需求描述。领域：${domainLabel}，任务ID：${task.taskId}。请用中文生成一段清晰的任务需求模板，包含目标、输入要求、输出格式。`;
      const res = await llmGenerateWorkflowContent(prompt);
      if (res.success && res.data) {
        const generated =
          typeof res.data === 'string'
            ? res.data
            : (res.data as Record<string, unknown>).requirement ||
              (res.data as Record<string, unknown>).content ||
              res.raw;
        updateTask(index, 'requirement', String(generated));
      }
    } catch {
      // ignore
    } finally {
      setPerTaskAiLoading((prev) => ({ ...prev, [index]: false }));
    }
  };

  // ── Form helpers ────────────────────────────────────────

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateTask = (index: number, field: keyof WorkflowTaskDef, value: unknown) => {
    setForm((prev) => {
      const tasks = prev.tasks.map((t, i) => (i === index ? { ...t, [field]: value } : t));
      return { ...prev, tasks };
    });
  };

  const addTask = () => {
    setForm((prev) => ({ ...prev, tasks: [...prev.tasks, emptyTask(prev.tasks)] }));
  };

  const removeTask = (index: number) => {
    setForm((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((_, i) => i !== index),
    }));
  };

  const moveTask = (index: number, dir: -1 | 1) => {
    setForm((prev) => {
      const tasks = [...prev.tasks];
      const target = index + dir;
      if (target < 0 || target >= tasks.length) return prev;
      [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
      return { ...prev, tasks };
    });
  };

  const addKeyword = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || form.keywords.includes(trimmed)) return;
    updateField('keywords', [...form.keywords, trimmed]);
  };

  const removeKeyword = (kw: string) => {
    updateField(
      'keywords',
      form.keywords.filter((k) => k !== kw),
    );
  };

  const isDirty =
    JSON.stringify(form) !== JSON.stringify(originalForm) ||
    (selectedName === null && (form.name || form.description || form.tasks.length > 0));

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-ink/40">加载工作流...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <SettingsNav />

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
              <GitBranch size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">工作流管理</h1>
              <p className="text-sm text-ink/40">创建、编辑和管理多任务编排工作流</p>
            </div>
          </div>
        </motion.div>

        {/* Global errors */}
        {errors.general && errors.general.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
            <div className="text-sm text-warning">
              {errors.general.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          </motion.div>
        )}

        {/* Two-panel layout */}
        <div className="flex gap-6">
          {/* ── Left panel: workflow list ──────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="w-64 shrink-0"
          >
            <div className="rounded-2xl border border-ink/8 bg-white p-4 shadow-warm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-ink">已有工作流</h2>
                <button
                  onClick={handleNew}
                  className="flex items-center gap-1 rounded-lg bg-coral/10 px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/20 transition-colors"
                >
                  <FilePlus size={12} />
                  新建
                </button>
              </div>

              {workflows.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink/30">
                  暂无工作流
                  <br />
                  点击「新建」创建第一个
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {workflows.map((wf) => (
                    <button
                      key={wf.name}
                      onClick={() => selectWorkflow(wf.name)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition-all ${
                        selectedName === wf.name
                          ? 'bg-coral/10 border border-coral/20'
                          : 'hover:bg-ink/5 border border-transparent'
                      }`}
                    >
                      <p
                        className={`text-sm font-medium truncate ${
                          selectedName === wf.name ? 'text-coral' : 'text-ink'
                        }`}
                      >
                        {wf.name}
                      </p>
                      <p className="text-[11px] text-ink/40 truncate mt-0.5">{wf.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-ink/30">
                          <Tag size={9} />
                          {wf.keywords.length}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-ink/30">
                          <Layers size={9} />
                          {wf.taskCount} 任务
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Right panel: editor ────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="flex-1 min-w-0"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedName ?? '__new__'}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* ── Section 1: Basic Info ──────────────── */}
                <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                  <div className="flex items-center gap-2 mb-5">
                    <GitBranch size={18} className="text-coral" />
                    <h2 className="font-semibold text-ink">基本信息</h2>
                    {isDirty && (
                      <span className="ml-2 text-[11px] text-warning font-medium">未保存</span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                        名称 <span className="text-ink/30 font-normal">(kebab-case)</span>
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder="rpg-character-system"
                        className={`w-full rounded-xl border-2 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:outline-none transition-all ${
                          errors.name
                            ? 'border-warning/50 focus:border-warning'
                            : 'border-ink/8 focus:border-coral/50'
                        }`}
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-warning flex items-center gap-1">
                          <AlertCircle size={11} />
                          {errors.name}
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-sm font-medium text-ink/60 mb-1.5 block">描述</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        rows={3}
                        placeholder="描述此工作流的用途和适用场景..."
                        className={`w-full rounded-xl border-2 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:outline-none transition-all resize-y ${
                          errors.description
                            ? 'border-warning/50 focus:border-warning'
                            : 'border-ink/8 focus:border-coral/50'
                        }`}
                      />
                      {errors.description && (
                        <p className="mt-1 text-xs text-warning flex items-center gap-1">
                          <AlertCircle size={11} />
                          {errors.description}
                        </p>
                      )}
                    </div>

                    {/* Keywords */}
                    <div>
                      <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                        关键词 <span className="text-ink/30 font-normal">(回车添加)</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-ink/8 bg-paper/50 px-3 py-2 focus-within:border-coral/50 transition-all">
                        {form.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="inline-flex items-center gap-1 rounded-lg bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral"
                          >
                            {kw}
                            <button
                              onClick={() => removeKeyword(kw)}
                              className="hover:text-coral/60 transition-colors"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                        <input
                          ref={keywordRef}
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addKeyword(keywordInput);
                              setKeywordInput('');
                            }
                          }}
                          placeholder={form.keywords.length === 0 ? '输入关键词后按回车...' : ''}
                          className="flex-1 min-w-[120px] bg-transparent py-0.5 text-sm text-ink placeholder:text-ink/25 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Section 2: Tasks ───────────────────── */}
                <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <Layers size={18} className="text-coral" />
                      <h2 className="font-semibold text-ink">
                        任务列表
                        <span className="ml-2 text-xs font-normal text-ink/30">
                          ({form.tasks.length} 个任务)
                        </span>
                      </h2>
                    </div>
                    <button
                      onClick={addTask}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo/10 px-3 py-1.5 text-xs font-medium text-indigo hover:bg-indigo/20 transition-colors"
                    >
                      <Plus size={13} />
                      添加任务
                    </button>
                  </div>

                  {form.tasks.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-ink/8 py-10 text-center">
                      <Layers size={24} className="mx-auto text-ink/15 mb-2" />
                      <p className="text-sm text-ink/30">暂无任务</p>
                      <p className="text-xs text-ink/20 mt-1">点击「添加任务」或使用 AI 生成</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {form.tasks.map((task, index) => {
                        const taskFieldErrors = errors.tasks?.[index];
                        return (
                          <motion.div
                            key={`${task.taskId}-${index}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className="rounded-xl border border-ink/8 bg-paper/30 p-4"
                          >
                            {/* Task header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => moveTask(index, -1)}
                                    disabled={index === 0}
                                    className="text-ink/20 hover:text-ink/50 disabled:opacity-30 transition-colors"
                                  >
                                    <ChevronDown size={10} className="rotate-180" />
                                  </button>
                                  <button
                                    onClick={() => moveTask(index, 1)}
                                    disabled={index === form.tasks.length - 1}
                                    className="text-ink/20 hover:text-ink/50 disabled:opacity-30 transition-colors"
                                  >
                                    <ChevronDown size={10} />
                                  </button>
                                </div>
                                <GripVertical size={14} className="text-ink/15" />
                                <span className="rounded-lg bg-indigo/10 px-2 py-0.5 text-xs font-mono font-semibold text-indigo">
                                  {task.taskId}
                                </span>
                              </div>
                              <button
                                onClick={() => removeTask(index)}
                                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink/30 hover:bg-warning/10 hover:text-warning transition-colors"
                              >
                                <Trash2 size={12} />
                                移除
                              </button>
                            </div>

                            {/* Task fields grid */}
                            <div className="grid gap-3 md:grid-cols-2">
                              {/* Domain */}
                              <div>
                                <label className="text-xs font-medium text-ink/50 mb-1 block">
                                  领域
                                </label>
                                <select
                                  value={task.domain}
                                  onChange={(e) => updateTask(index, 'domain', e.target.value)}
                                  className="w-full rounded-lg border-2 border-ink/8 bg-white px-3 py-2 text-sm text-ink focus:border-coral/50 focus:outline-none transition-all"
                                >
                                  {DOMAIN_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Output type */}
                              <div>
                                <label className="text-xs font-medium text-ink/50 mb-1 block">
                                  输出类型
                                </label>
                                <select
                                  value={task.outputType}
                                  onChange={(e) =>
                                    updateTask(index, 'outputType', e.target.value)
                                  }
                                  className="w-full rounded-lg border-2 border-ink/8 bg-white px-3 py-2 text-sm text-ink focus:border-coral/50 focus:outline-none transition-all"
                                >
                                  {OUTPUT_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Requirement template */}
                              <div className="md:col-span-2">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium text-ink/50">
                                    需求模板
                                  </label>
                                  <button
                                    onClick={() => handleTaskAiGenerate(index)}
                                    disabled={!!perTaskAiLoading[index]}
                                    className="flex items-center gap-1 rounded-md bg-coral/10 px-2 py-0.5 text-[10px] font-medium text-coral hover:bg-coral/20 disabled:opacity-50 transition-colors"
                                    title="AI 生成需求模板"
                                  >
                                    {perTaskAiLoading[index] ? (
                                      <Loader2 size={10} className="animate-spin" />
                                    ) : (
                                      <Sparkles size={10} />
                                    )}
                                    AI
                                  </button>
                                </div>
                                <textarea
                                  value={task.requirement}
                                  onChange={(e) =>
                                    updateTask(index, 'requirement', e.target.value)
                                  }
                                  rows={4}
                                  placeholder="描述此任务需要完成的具体要求，支持模板变量如 {{context}}、{{previous_output}}..."
                                  className={`w-full rounded-lg border-2 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none transition-all resize-y ${
                                    taskFieldErrors?.requirement
                                      ? 'border-warning/50 focus:border-warning'
                                      : 'border-ink/8 focus:border-coral/50'
                                  }`}
                                />
                                {taskFieldErrors?.requirement && (
                                  <p className="mt-1 text-[11px] text-warning flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    {taskFieldErrors.requirement}
                                  </p>
                                )}
                              </div>

                              {/* Dependencies */}
                              <div>
                                <label className="text-xs font-medium text-ink/50 mb-1 block">
                                  依赖任务{' '}
                                  <span className="text-ink/30 font-normal">(多选)</span>
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                  {form.tasks
                                    .filter((_, i) => i !== index)
                                    .map((t) => {
                                      const isSelected = task.dependencies.includes(t.taskId);
                                      return (
                                        <button
                                          key={t.taskId}
                                          onClick={() => {
                                            const deps = isSelected
                                              ? task.dependencies.filter((d) => d !== t.taskId)
                                              : [...task.dependencies, t.taskId];
                                            updateTask(index, 'dependencies', deps);
                                          }}
                                          className={`rounded-lg px-2 py-1 text-[11px] font-mono transition-colors ${
                                            isSelected
                                              ? 'bg-indigo text-white'
                                              : 'bg-ink/5 text-ink/40 hover:bg-ink/10'
                                          }`}
                                        >
                                          {t.taskId}
                                        </button>
                                      );
                                    })}
                                  {form.tasks.length <= 1 && (
                                    <span className="text-[11px] text-ink/20">
                                      至少需要两个任务才能设置依赖
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Output template */}
                              <div>
                                <label className="text-xs font-medium text-ink/50 mb-1 block">
                                  输出模板
                                </label>
                                <input
                                  value={task.outputTemplate}
                                  onChange={(e) =>
                                    updateTask(index, 'outputTemplate', e.target.value)
                                  }
                                  placeholder="如: {name}_design_doc.md"
                                  className={`w-full rounded-lg border-2 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/25 focus:outline-none transition-all ${
                                    taskFieldErrors?.outputTemplate
                                      ? 'border-warning/50 focus:border-warning'
                                      : 'border-ink/8 focus:border-coral/50'
                                  }`}
                                />
                                {taskFieldErrors?.outputTemplate && (
                                  <p className="mt-1 text-[11px] text-warning flex items-center gap-1">
                                    <AlertCircle size={10} />
                                    {taskFieldErrors.outputTemplate}
                                  </p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Section 3: AI Assisted ─────────────── */}
                <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                  <button
                    onClick={() => setAiOpen(!aiOpen)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    {aiOpen ? (
                      <ChevronDown size={16} className="text-coral" />
                    ) : (
                      <ChevronRight size={16} className="text-coral" />
                    )}
                    <Sparkles size={18} className="text-coral" />
                    <h2 className="font-semibold text-ink">AI 辅助</h2>
                    <span className="text-[11px] text-ink/30">通过 LLM 自动生成工作流内容</span>
                  </button>

                  <AnimatePresence>
                    {aiOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                              描述你想生成的工作流
                            </label>
                            <div className="flex gap-2">
                              <input
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAiGenerate();
                                  }
                                }}
                                placeholder="帮我设计一个RPG角色培养系统的工作流任务"
                                className="flex-1 rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                              />
                              <button
                                onClick={handleAiGenerate}
                                disabled={aiGenerating || !aiPrompt.trim()}
                                className="flex items-center gap-1.5 rounded-xl bg-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {aiGenerating ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Sparkles size={15} />
                                )}
                                生成
                              </button>
                            </div>
                          </div>

                          {aiError && (
                            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
                              <AlertCircle size={14} className="mt-0.5 shrink-0 text-warning" />
                              <p className="text-sm text-warning">{aiError}</p>
                            </div>
                          )}

                          {aiResult != null && (
                            <motion.div
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="rounded-xl border border-ink/8 bg-paper/30 p-4"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-ink/50">生成结果预览</p>
                                <button
                                  onClick={applyAiResult}
                                  className="flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                                >
                                  <CheckCircle2 size={12} />
                                  应用到表单
                                </button>
                              </div>
                              <pre className="max-h-60 overflow-auto rounded-lg bg-ink/5 p-3 text-xs text-ink/70 font-mono leading-relaxed whitespace-pre-wrap">
                                {typeof aiResult === 'string'
                                  ? aiResult
                                  : JSON.stringify(aiResult, null, 2)}
                              </pre>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ── Section 4: Action Buttons ──────────── */}
                <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white hover:bg-coral/90 disabled:opacity-50 transition-colors"
                    >
                      {saving ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : saveSuccess ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Save size={15} />
                      )}
                      {saving ? '保存中...' : saveSuccess ? '已保存' : '保存'}
                    </button>

                    {selectedName && (
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/5 px-5 py-2.5 text-sm font-medium text-warning hover:bg-warning/10 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                        {deleting ? '删除中...' : '删除'}
                      </button>
                    )}

                    <button
                      onClick={handleNew}
                      className="flex items-center gap-2 rounded-xl border border-ink/10 px-5 py-2.5 text-sm font-medium text-ink/60 hover:bg-ink/5 transition-colors"
                    >
                      <FilePlus size={15} />
                      新建工作流
                    </button>

                    {saveSuccess && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs text-success font-medium flex items-center gap-1"
                      >
                        <CheckCircle2 size={12} />
                        工作流已成功保存
                      </motion.span>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      <DeerflowBadge />
    </div>
  );
}
