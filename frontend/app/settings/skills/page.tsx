'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Plus,
  Save,
  Trash2,
  FileText,
  X,
  Check,
  AlertTriangle,
  Code2,
  Search,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import SettingsNav from '@/components/SettingsNav';
import {
  listSkills,
  getSkill,
  saveSkill,
  deleteSkill,
  type SkillInfo,
} from '@/lib/api';

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New skill dialog
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Load skills list
  const loadSkills = useCallback(async () => {
    try {
      const { skills } = await listSkills();
      setSkills(skills);
    } catch {
      showToast('Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Load skill content when selected
  const selectSkill = useCallback(
    async (name: string) => {
      setSelectedName(name);
      setEditorLoading(true);
      setSaved(false);
      try {
        const detail = await getSkill(name);
        setEditorContent(detail.content);
      } catch {
        showToast(`Failed to load skill: ${name}`, 'error');
      } finally {
        setEditorLoading(false);
      }
    },
    [showToast],
  );

  // Save skill
  const handleSave = useCallback(async () => {
    if (!selectedName) return;
    setSaving(true);
    try {
      await saveSkill(selectedName, editorContent);
      setSaved(true);
      showToast(`Skill "${selectedName}" saved`, 'success');
      // Refresh list to update size/metadata
      await loadSkills();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      showToast('Failed to save skill', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedName, editorContent, showToast, loadSkills]);

  // Create new skill
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const skillName = newName.trim();
    const description = newDescription.trim() || 'A custom agent skill';
    const content = `---
name: "${skillName}"
description: "${description}"
---

# ${skillName}

Skill content here...
`;
    try {
      await saveSkill(skillName, content);
      showToast(`Skill "${skillName}" created`, 'success');
      setShowNewSkill(false);
      setNewName('');
      setNewDescription('');
      await loadSkills();
      // Auto-select the newly created skill
      await selectSkill(skillName);
    } catch {
      showToast('Failed to create skill', 'error');
    } finally {
      setCreating(false);
    }
  }, [newName, newDescription, showToast, loadSkills, selectSkill]);

  // Delete skill
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSkill(deleteTarget);
      showToast(`Skill "${deleteTarget}" deleted`, 'success');
      if (selectedName === deleteTarget) {
        setSelectedName(null);
        setEditorContent('');
      }
      setDeleteTarget(null);
      await loadSkills();
    } catch {
      showToast('Failed to delete skill', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedName, showToast, loadSkills]);

  // Filtered skills list
  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <SettingsNav />
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-ink/40">Loading skills...</div>
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

        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo text-white">
              <Zap size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">Skills</h1>
              <p className="text-sm text-ink/40">
                Manage agent skills — each skill defines a specialized capability
              </p>
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
          {/* Left Panel — Skill List */}
          <div className="w-64 shrink-0">
            <div className="rounded-2xl border border-ink/8 bg-white shadow-warm overflow-hidden">
              {/* Search & New */}
              <div className="p-3 border-b border-ink/5 space-y-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search skills..."
                    className="w-full rounded-lg border border-ink/8 bg-paper/50 pl-8 pr-3 py-2 text-xs text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                  />
                </div>
                <button
                  onClick={() => setShowNewSkill(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-coral px-3 py-2 text-xs font-medium text-white hover:bg-coral/90 transition-colors"
                >
                  <Plus size={14} />
                  New Skill
                </button>
              </div>

              {/* Skill Items */}
              <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
                {filteredSkills.length === 0 ? (
                  <div className="py-8 text-center text-xs text-ink/30">
                    {skills.length === 0
                      ? 'No skills yet. Create one!'
                      : 'No skills match your search.'}
                  </div>
                ) : (
                  filteredSkills.map((skill) => (
                    <button
                      key={skill.name}
                      onClick={() => selectSkill(skill.name)}
                      className={`w-full text-left px-4 py-3 border-b border-ink/5 last:border-b-0 transition-colors group ${
                        selectedName === skill.name
                          ? 'bg-coral/5 border-l-2 border-l-coral'
                          : 'hover:bg-ink/[0.02]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText
                          size={14}
                          className={`mt-0.5 shrink-0 ${
                            selectedName === skill.name
                              ? 'text-coral'
                              : 'text-ink/30'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium truncate ${
                              selectedName === skill.name
                                ? 'text-coral'
                                : 'text-ink'
                            }`}
                          >
                            {skill.name}
                          </p>
                          <p className="text-[11px] text-ink/40 truncate mt-0.5">
                            {skill.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Panel — Editor */}
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl border border-ink/8 bg-white shadow-warm overflow-hidden">
              {selectedName ? (
                <>
                  {/* Editor Header */}
                  <div className="flex items-center justify-between border-b border-ink/5 px-5 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Code2 size={16} className="text-coral shrink-0" />
                      <span className="text-sm font-semibold text-ink truncate">
                        {selectedName}
                      </span>
                      <span className="text-[11px] text-ink/30 shrink-0">
                        SKILL.md
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDeleteTarget(selectedName)}
                        className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/50 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-lg bg-coral px-4 py-1.5 text-xs font-medium text-white hover:bg-coral/90 disabled:opacity-50 transition-colors"
                      >
                        {saved ? (
                          <Check size={13} />
                        ) : (
                          <Save size={13} />
                        )}
                        {saving
                          ? 'Saving...'
                          : saved
                            ? 'Saved'
                            : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Editor Body */}
                  {editorLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="text-sm text-ink/40">Loading...</div>
                    </div>
                  ) : (
                    <textarea
                      value={editorContent}
                      onChange={(e) => {
                        setEditorContent(e.target.value);
                        setSaved(false);
                      }}
                      spellCheck={false}
                      className="w-full h-[calc(100vh-340px)] min-h-[400px] resize-none bg-paper/30 px-5 py-4 font-mono text-sm text-ink leading-relaxed focus:outline-none placeholder:text-ink/25"
                      placeholder="Write your SKILL.md content here..."
                    />
                  )}
                </>
              ) : (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink/5 mb-4">
                    <Zap size={28} className="text-ink/20" />
                  </div>
                  <p className="text-sm font-medium text-ink/40 mb-1">
                    No skill selected
                  </p>
                  <p className="text-xs text-ink/30">
                    Choose a skill from the list or create a new one
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      <DeerflowBadge />

      {/* ── New Skill Dialog ── */}
      <AnimatePresence>
        {showNewSkill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
            onClick={() => setShowNewSkill(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-ink/8 bg-white p-6 shadow-warm-lg"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral/10">
                    <Plus size={16} className="text-coral" />
                  </div>
                  <h2 className="font-semibold text-ink">Create New Skill</h2>
                </div>
                <button
                  onClick={() => setShowNewSkill(false)}
                  className="rounded-lg p-1.5 text-ink/30 hover:bg-ink/5 hover:text-ink transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                    Skill Name <span className="text-coral">*</span>
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. code-review, test-generator"
                    autoFocus
                    className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                  />
                  <p className="mt-1 text-[11px] text-ink/30">
                    Use lowercase letters, numbers, and hyphens
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-ink/60 mb-1.5 block">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description of what this skill does"
                    className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowNewSkill(false)}
                  className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="flex items-center gap-1.5 rounded-xl bg-coral px-5 py-2 text-sm font-medium text-white hover:bg-coral/90 disabled:opacity-50 transition-colors"
                >
                  {creating ? (
                    <>Creating...</>
                  ) : (
                    <>
                      <Plus size={14} />
                      Create
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Dialog ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-ink/8 bg-white p-6 shadow-warm-lg"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div>
                  <h2 className="font-semibold text-ink">Delete Skill</h2>
                  <p className="text-xs text-ink/40">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-sm text-ink/60 mb-6">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-ink">{deleteTarget}</span>?
              </p>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-ink/60 hover:bg-ink/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {deleting ? (
                    <>Deleting...</>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast Notification ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 z-50"
          >
            <div
              className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-warm-lg ${
                toast.type === 'success' ? 'bg-success' : 'bg-red-500'
              }`}
            >
              {toast.type === 'success' ? <Check size={15} /> : <AlertTriangle size={15} />}
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
