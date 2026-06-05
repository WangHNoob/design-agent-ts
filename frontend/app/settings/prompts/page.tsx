'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Save,
  Trash2,
  Check,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import SettingsNav from '@/components/SettingsNav';
import {
  listPrompts,
  getPrompt,
  savePrompt,
  deletePrompt,
  type PromptInfo,
} from '@/lib/api';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState('');
  const [selectedIsBuiltin, setSelectedIsBuiltin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // New prompt dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const { prompts: list } = await listPrompts();
      setPrompts(list);
    } catch {
      showToast('加载提示词列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleSelect = async (name: string) => {
    if (name === selectedName) return;

    if (isDirty) {
      const confirm = window.confirm('当前提示词有未保存的修改，确定要切换吗？');
      if (!confirm) return;
    }

    setSelectedName(name);
    setLoadingContent(true);
    setIsDirty(false);

    try {
      const detail = await getPrompt(name);
      setSelectedContent(detail.content);
      setSelectedIsBuiltin(detail.isBuiltin);
    } catch {
      showToast(`加载提示词 "${name}" 失败`, 'error');
      setSelectedName(null);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSave = async () => {
    if (!selectedName) return;

    setSaving(true);
    try {
      await savePrompt(selectedName, selectedContent);
      setIsDirty(false);
      showToast('保存成功', 'success');
      await loadPrompts();
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedName || selectedIsBuiltin) return;

    setDeleting(true);
    try {
      await deletePrompt(selectedName);
      showToast(`已删除提示词 "${selectedName}"`, 'success');
      setSelectedName(null);
      setSelectedContent('');
      setIsDirty(false);
      await loadPrompts();
    } catch {
      showToast('删除失败', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCreate = async () => {
    const name = newPromptName.trim();
    if (!name) return;

    setCreating(true);
    try {
      await savePrompt(name, `# ${name}\n\n在此输入提示词内容...`);
      showToast(`已创建提示词 "${name}"`, 'success');
      setShowNewDialog(false);
      setNewPromptName('');
      await loadPrompts();
      await handleSelect(name);
    } catch {
      showToast('创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelCreate = () => {
    setShowNewDialog(false);
    setNewPromptName('');
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <SettingsNav />
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-ink/40" />
            <span className="ml-2 text-sm text-ink/40">加载中...</span>
          </div>
        </main>
        <DeerflowBadge />
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
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">提示词管理</h1>
              <p className="text-sm text-ink/40">查看和编辑 Agent 使用的系统提示词模板</p>
            </div>
          </div>
        </motion.div>

        {/* Two-column layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex gap-6"
        >
          {/* Left sidebar - Prompt list */}
          <div className="w-64 flex-shrink-0">
            <div className="rounded-2xl border border-ink/8 bg-white p-4 shadow-warm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-ink">提示词列表</h2>
                <button
                  onClick={() => setShowNewDialog(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-coral/10 text-coral hover:bg-coral/20 transition-colors"
                  title="新建提示词"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* New prompt dialog */}
              <AnimatePresence>
                {showNewDialog && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-3 rounded-xl border border-ink/8 bg-paper/50 p-3">
                      <input
                        type="text"
                        value={newPromptName}
                        onChange={(e) => setNewPromptName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreate();
                          if (e.key === 'Escape') handleCancelCreate();
                        }}
                        placeholder="输入提示词名称..."
                        autoFocus
                        className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-coral/50 focus:outline-none mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreate}
                          disabled={!newPromptName.trim() || creating}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-coral px-3 py-1.5 text-xs font-medium text-white hover:bg-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {creating ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          创建
                        </button>
                        <button
                          onClick={handleCancelCreate}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-ink/5 transition-colors"
                        >
                          <X size={12} />
                          取消
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Prompt list */}
              <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
                {prompts.length === 0 ? (
                  <p className="text-xs text-ink/40 text-center py-4">暂无提示词</p>
                ) : (
                  prompts.map((prompt) => (
                    <button
                      key={prompt.name}
                      onClick={() => handleSelect(prompt.name)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition-all ${
                        selectedName === prompt.name
                          ? 'bg-coral/10 border border-coral/20'
                          : 'hover:bg-ink/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            selectedName === prompt.name ? 'text-coral' : 'text-ink'
                          }`}
                        >
                          {prompt.name}
                        </span>
                        {prompt.isBuiltin && (
                          <span className="flex-shrink-0 rounded-full bg-indigo/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo">
                            内置
                          </span>
                        )}
                      </div>
                      {prompt.preview && (
                        <p className="mt-0.5 text-[11px] text-ink/40 truncate">
                          {prompt.preview}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right area - Editor */}
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
              {selectedName ? (
                <>
                  {/* Editor header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="font-semibold text-ink">{selectedName}</h2>
                      {selectedIsBuiltin && (
                        <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-[11px] font-medium text-indigo">
                          内置提示词
                        </span>
                      )}
                      {isDirty && (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                          未保存
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!selectedIsBuiltin && (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-1.5 rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-ink/60 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                        >
                          <Trash2 size={14} />
                          删除
                        </button>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving || !isDirty}
                        className="flex items-center gap-1.5 rounded-xl bg-coral px-5 py-2 text-sm font-medium text-white hover:bg-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>

                  {/* Editor textarea */}
                  {loadingContent ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 size={24} className="animate-spin text-ink/40" />
                      <span className="ml-2 text-sm text-ink/40">加载内容中...</span>
                    </div>
                  ) : (
                    <textarea
                      value={selectedContent}
                      onChange={(e) => {
                        setSelectedContent(e.target.value);
                        setIsDirty(true);
                      }}
                      className="w-full h-[calc(100vh-380px)] min-h-[400px] rounded-xl border-2 border-ink/8 bg-paper/30 p-4 font-mono text-sm text-ink leading-relaxed resize-none focus:border-coral/30 focus:outline-none transition-all"
                      placeholder="在此输入提示词内容..."
                      spellCheck={false}
                    />
                  )}

                  {/* Editor footer */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink/30">
                    <span>{selectedContent.length} 字符</span>
                    <span>
                      {selectedContent.split('\n').length} 行
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink/5 mb-4">
                    <FileText size={28} className="text-ink/20" />
                  </div>
                  <p className="text-sm text-ink/40 mb-1">选择一个提示词进行编辑</p>
                  <p className="text-xs text-ink/30">
                    或点击左侧的 <Plus size={12} className="inline" /> 按钮创建新提示词
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      <DeerflowBadge />

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm-lg max-w-sm mx-4"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-ink">确认删除</h3>
                  <p className="text-xs text-ink/40">此操作不可撤销</p>
                </div>
              </div>
              <p className="text-sm text-ink/60 mb-5">
                确定要删除提示词 <span className="font-medium text-ink">"{selectedName}"</span> 吗？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  确认删除
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-xl border border-ink/10 px-4 py-2.5 text-sm font-medium text-ink/60 hover:bg-ink/5 transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-warm-lg ${
                toast.type === 'success'
                  ? 'bg-success text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
