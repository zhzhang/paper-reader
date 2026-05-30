"use client";

import { useCallback, useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  currentModel?: string;
}

interface ClaudeModel {
  id: string;
  displayName: string;
}

export function ApiKeyModal({ open, onClose, onSaved, currentModel }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(currentModel || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [models, setModels] = useState<ClaudeModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [manualModel, setManualModel] = useState(false);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModelsError(
          data.needsKey
            ? "Enter your API key first, then load models."
            : data.error || "Failed to load models.",
        );
        setModels([]);
        return;
      }
      setModels(data.models || []);
      if ((data.models || []).length === 0) {
        setModelsError("No models returned for this key.");
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoadingModels(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!open) return;
    setModel(currentModel || "");
    setModels([]);
    setModelsError(null);
    setManualModel(false);
    // Auto-load models if a key is already configured server-side.
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentModel]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save.");
        return;
      }
      setApiKey("");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  };

  const useDropdown = models.length > 0 && !manualModel;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900">Claude API key</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Used to define formula terms. Stored locally in your app database.
        </p>

        <label className="mt-4 block text-xs font-medium text-neutral-600">
          API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <div className="mt-3 flex items-center justify-between">
          <label className="block text-xs font-medium text-neutral-600">
            Model
          </label>
          <button
            type="button"
            onClick={loadModels}
            disabled={loadingModels}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            {loadingModels ? "Loading…" : "Load available models"}
          </button>
        </div>

        {useDropdown ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="">Use default (latest Sonnet)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.id})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-3-5-sonnet-latest"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        )}

        {modelsError && (
          <p className="mt-1 text-xs text-amber-600">{modelsError}</p>
        )}
        {models.length > 0 && (
          <button
            type="button"
            onClick={() => setManualModel((v) => !v)}
            className="mt-1 text-xs text-neutral-400 hover:text-neutral-600"
          >
            {useDropdown ? "Enter a model name manually" : "Choose from list"}
          </button>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
