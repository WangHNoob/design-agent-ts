'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FolderOpen, FileText, Download, Package, Loader2 } from 'lucide-react';
import { fetchSessionFiles, getSessionZipUrl, downloadSessionFile, type SessionFilesResponse, type SessionTaskFiles, type SessionFileInfo } from '@/lib/api';

interface Props {
  sessionId: string;
}

export default function FileBrowserPanel({ sessionId }: Props) {
  const [data, setData] = useState<SessionFilesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSessionFiles(sessionId);
      setData(res);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const allFileUrls = useMemo(() => {
    if (!data) return [];
    const urls: string[] = [];
    for (const task of data.tasks) {
      for (const file of task.files) {
        urls.push(file.downloadUrl);
      }
    }
    return urls;
  }, [data]);

  const allSelected = allFileUrls.length > 0 && selected.size === allFileUrls.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allFileUrls));
    }
  };

  const toggleFile = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const handleDownloadSelected = async () => {
    const urls = Array.from(selected);
    for (let i = 0; i < urls.length; i++) {
      downloadSessionFile(urls[i]);
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ink/60">
        <Loader2 size={24} className="animate-spin mb-2" />
        <span className="text-xs">加载文件列表…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ink/60 gap-3">
        <span className="text-xs text-ink/70">{error}</span>
        <button
          onClick={load}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium bg-coral text-white hover:bg-coral/90 transition-colors"
        >
          <Loader2 size={12} />
          重试
        </button>
      </div>
    );
  }

  if (!data || data.tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-ink/50">
        <FolderOpen size={24} className="mb-2" />
        <span className="text-xs">暂无文件</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 py-2 border-b border-ink/6 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-ink/70 cursor-pointer select-none hover:text-ink transition-colors">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="rounded border-ink/20 text-coral focus:ring-coral"
          />
          全选
        </label>
        <a
          href={getSessionZipUrl(sessionId)}
          download
          className="flex items-center gap-1 text-xs text-coral hover:text-coral/80 transition-colors"
        >
          <Package size={12} />
          打包下载全部
        </a>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1 space-y-1">
        {data.tasks.map((task) => (
          <TaskGroup key={task.taskId} task={task} selected={selected} onToggleFile={toggleFile} />
        ))}
      </div>

      {/* Bottom actions */}
      {selected.size > 0 && (
        <div className="shrink-0 border-t border-ink/6 px-1 py-2">
          <button
            onClick={handleDownloadSelected}
            className="w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-coral text-white hover:bg-coral/90 transition-colors"
          >
            <Download size={12} />
            下载选中 ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  task,
  selected,
  onToggleFile,
}: {
  task: SessionTaskFiles;
  selected: Set<string>;
  onToggleFile: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border border-ink/6 bg-white overflow-hidden">
      {/* Task header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-ink/5 transition-colors"
      >
        <FolderOpen size={14} className="text-coral shrink-0" />
        <span className="text-xs font-medium text-ink/90 truncate">{task.domain}</span>
        <span className="text-[10px] text-ink/40 font-mono ml-auto shrink-0">{task.files.length}</span>
      </button>

      {/* Files */}
      {expanded && (
        <div className="divide-y divide-ink/4">
          {task.files.map((file) => (
            <FileRow
              key={file.downloadUrl}
              file={file}
              checked={selected.has(file.downloadUrl)}
              onToggle={() => onToggleFile(file.downloadUrl)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  checked,
  onToggle,
}: {
  file: SessionFileInfo;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-ink/5 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="rounded border-ink/20 text-coral focus:ring-coral shrink-0"
      />
      <FileText size={14} className="text-ink/50 shrink-0" />
      <span className="flex-1 text-xs text-ink/80 truncate" title={file.name}>
        {file.name}
      </span>
      <span className="text-[10px] text-ink/40 font-mono shrink-0">{file.size}</span>
      <button
        onClick={() => downloadSessionFile(file.downloadUrl)}
        className="shrink-0 p-1 rounded text-ink/50 hover:text-coral hover:bg-coral/10 transition-colors"
        title="下载"
      >
        <Download size={12} />
      </button>
    </div>
  );
}
