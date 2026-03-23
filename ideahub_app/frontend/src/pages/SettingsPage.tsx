import { useState, useEffect } from 'react';
import {
  Bot, Plus, Check, Trash2, Loader2, X, Save, Eye, EyeOff,
  CheckCircle, AlertCircle, Settings2, RefreshCw
} from 'lucide-react';
import {
  getAIModels, createAIModel, updateAIModel, deleteAIModel, activateAIModel, getOCRStatus,
  fetchAvailableModels, fetchModelsByConfig
} from '../services/api';
import type { AIModelConfig, CreateAIModelRequest, OCRStatus, AvailableModel, FetchModelsResponse } from '../types';
import ModelCombobox from '../components/ModelCombobox';

// Toast component - Memphis Style
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed top-4 right-4 z-50 memphis-toast ${
      type === 'success' ? 'memphis-toast-success' : 'memphis-toast-error'
    }`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-80 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Model Card Component with inline editing
function ModelCard({
  model,
  onUpdate,
  onDelete,
  onActivate,
  showToast,
}: {
  model: AIModelConfig;
  onUpdate: (id: number, data: Partial<CreateAIModelRequest>) => Promise<void>;
  onDelete: (model: AIModelConfig) => Promise<void>;
  onActivate: (model: AIModelConfig) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error') => void;
}) {
  // Local editing state
  const [name, setName] = useState(model.name);
  const [baseUrl, setBaseUrl] = useState(model.base_url);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState(model.model_name);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Available models state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsSource, setModelsSource] = useState<FetchModelsResponse['source'] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  // Check if there are unsaved changes
  const hasChanges = name !== model.name || 
    baseUrl !== model.base_url || 
    apiKey !== '' || 
    modelName !== model.model_name;

  // Reset form when model changes
  useEffect(() => {
    setName(model.name);
    setBaseUrl(model.base_url);
    setModelName(model.model_name);
    setApiKey('');
  }, [model]);

  // Fetch available models
  const handleFetchModels = async () => {
    if (!model.api_key && !apiKey) {
      showToast('请先配置 API Key', 'error');
      return;
    }
    
    setFetchingModels(true);
    try {
      const response = await fetchAvailableModels(model.id);
      setAvailableModels(response.models);
      setModelsSource(response.source);
      if (response.source === 'error') {
        showToast('查询失败，请检查 API 配置', 'error');
      } else {
        showToast(`已获取 ${response.models.length} 个可用模型`, 'success');
      }
    } catch (error) {
      showToast('查询可用模型失败', 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!hasChanges) return;
    
    setSaving(true);
    try {
      const updateData: Partial<CreateAIModelRequest> = {};
      if (name !== model.name) updateData.name = name;
      if (baseUrl !== model.base_url) updateData.base_url = baseUrl;
      if (apiKey) updateData.api_key = apiKey;
      if (modelName !== model.model_name) updateData.model_name = modelName;
      
      await onUpdate(model.id, updateData);
      setApiKey(''); // Clear API key input after save
    } catch (error) {
      // Error handled in parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`memphis-card p-5 space-y-4 ${
      model.is_active 
        ? 'border-[var(--memphis-secondary)] bg-[rgba(78,205,196,0.08)]' 
        : ''
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border-2 border-[var(--memphis-dark)] ${
            model.is_active ? 'bg-[var(--memphis-secondary)]' : 'bg-gray-100'
          }`}>
            <Bot className={`w-5 h-5 ${model.is_active ? 'text-[var(--memphis-dark)]' : 'text-gray-600'}`} />
          </div>
          <div className="flex items-center gap-2">
            {model.is_preset && (
              <span className="memphis-tag">预设</span>
            )}
            {model.is_active && (
              <span className="memphis-tag memphis-tag-secondary flex items-center gap-1">
                <Check className="w-3 h-3" />
                已激活
              </span>
            )}
            {!model.api_key && (
              <span className="memphis-tag memphis-tag-accent">未配置</span>
            )}
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="memphis-input"
          />
        </div>

        {/* Provider Type - Read only */}
        <div>
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">协议类型</label>
          <input
            type="text"
            value={model.provider_type === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}
            disabled
            className="memphis-input bg-gray-50 text-gray-500 cursor-not-allowed"
          />
        </div>

        {/* Base URL */}
        <div className="md:col-span-2">
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">API 地址</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="memphis-input"
          />
        </div>

        {/* API Key */}
        <div className="md:col-span-2">
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">
            API Key {model.api_key && <span className="text-gray-400 font-normal">(当前: {model.api_key})</span>}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={model.api_key ? '留空则不修改' : '输入 API Key'}
              className="memphis-input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[var(--memphis-primary)] transition-colors"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Model Name with Combobox */}
        <div className="md:col-span-2">
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">模型</label>
          <div className="flex gap-2">
            <div className="flex-1">
              <ModelCombobox
                value={modelName}
                onChange={setModelName}
                models={availableModels}
                loading={fetchingModels}
                source={modelsSource}
                placeholder="选择或输入模型名称"
              />
            </div>
            <button
              onClick={handleFetchModels}
              disabled={fetchingModels || (!model.api_key && !apiKey)}
              className="memphis-btn memphis-btn-accent memphis-btn-sm flex items-center gap-2 whitespace-nowrap"
            >
              {fetchingModels ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              查询可用模型
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-3 border-t-[3px] border-dashed border-[var(--memphis-dark)] mt-4">
        <div className="flex items-center gap-2">
          {!model.is_active && (
            <button
              onClick={() => onActivate(model)}
              className="memphis-btn memphis-btn-secondary memphis-btn-sm"
            >
              设为默认
            </button>
          )}
          {!model.is_preset && (
            <button
              onClick={() => onDelete(model)}
              className="memphis-btn memphis-btn-sm bg-[var(--memphis-error)] text-white flex items-center gap-1"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`memphis-btn flex items-center gap-2 ${
            hasChanges
              ? 'memphis-btn-primary'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存更改
        </button>
      </div>
    </div>
  );
}

// Add Model Dialog
function AddModelDialog({
  onSave,
  onCancel,
  loading,
  showToast,
}: {
  onSave: (data: CreateAIModelRequest) => void;
  onCancel: () => void;
  loading: boolean;
  showToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<'openai' | 'anthropic'>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Available models state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsSource, setModelsSource] = useState<FetchModelsResponse['source'] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  // Update base URL when provider changes
  useEffect(() => {
    if (providerType === 'openai') {
      setBaseUrl('https://api.openai.com/v1');
    } else {
      setBaseUrl('https://api.anthropic.com');
    }
    setAvailableModels([]);
    setModelsSource(null);
  }, [providerType]);

  // Fetch available models
  const handleFetchModels = async () => {
    if (!apiKey || !baseUrl) {
      showToast('请先填写 API 地址和 API Key', 'error');
      return;
    }
    
    setFetchingModels(true);
    try {
      const response = await fetchModelsByConfig({
        provider_type: providerType,
        base_url: baseUrl,
        api_key: apiKey,
      });
      setAvailableModels(response.models);
      setModelsSource(response.source);
      if (response.source === 'error') {
        showToast('查询失败，请检查配置', 'error');
      } else {
        showToast(`已获取 ${response.models.length} 个可用模型`, 'success');
      }
    } catch (error) {
      showToast('查询可用模型失败', 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelName.trim()) return;
    onSave({
      name,
      provider_type: providerType,
      base_url: baseUrl,
      api_key: apiKey,
      model_name: modelName,
    });
  };

  return (
    <div className="memphis-modal-overlay">
      <div className="memphis-modal p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="memphis-heading memphis-heading-md">添加自定义模型</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-[var(--memphis-primary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">显示名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：My GPT-4"
              className="memphis-input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">协议类型</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as 'openai' | 'anthropic')}
              className="memphis-input"
            >
              <option value="openai">OpenAI 兼容</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">API 地址</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="memphis-input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 API Key"
                className="memphis-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[var(--memphis-primary)] transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-1">模型</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <ModelCombobox
                  value={modelName}
                  onChange={setModelName}
                  models={availableModels}
                  loading={fetchingModels}
                  source={modelsSource}
                  placeholder="选择或输入模型名称"
                />
              </div>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={fetchingModels || !apiKey || !baseUrl}
                className="memphis-btn memphis-btn-accent memphis-btn-sm flex items-center gap-2 whitespace-nowrap"
              >
                {fetchingModels ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                查询
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t-[3px] border-dashed border-[var(--memphis-dark)]">
            <button
              type="button"
              onClick={onCancel}
              className="memphis-btn"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !modelName.trim()}
              className="memphis-btn memphis-btn-primary flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SettingsPage() {
  const [models, setModels] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // OCR status
  const [ocrStatus, setOcrStatus] = useState<OCRStatus | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch models
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [modelsData, ocrData] = await Promise.all([
          getAIModels(),
          getOCRStatus().catch(() => null)
        ]);
        setModels(modelsData);
        setOcrStatus(ocrData);
      } catch (error) {
        showToast('获取配置失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Create model
  const handleCreateModel = async (data: CreateAIModelRequest) => {
    try {
      setSaving(true);
      const newModel = await createAIModel(data);
      setModels([...models, newModel]);
      setShowAddDialog(false);
      showToast('模型添加成功', 'success');
    } catch (error) {
      showToast('添加失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Update model
  const handleUpdateModel = async (id: number, data: Partial<CreateAIModelRequest>) => {
    try {
      const updated = await updateAIModel(id, data);
      setModels(models.map(m => m.id === updated.id ? updated : m));
      showToast('更新成功', 'success');
    } catch (error) {
      showToast('更新失败，请重试', 'error');
      throw error;
    }
  };

  // Delete model
  const handleDeleteModel = async (model: AIModelConfig) => {
    if (model.is_preset) {
      showToast('预设模型不能删除', 'error');
      return;
    }
    if (!confirm(`确定要删除模型 "${model.name}" 吗？`)) return;
    
    try {
      await deleteAIModel(model.id);
      setModels(models.filter(m => m.id !== model.id));
      showToast('删除成功', 'success');
    } catch (error) {
      showToast('删除失败，请重试', 'error');
    }
  };

  // Activate model
  const handleActivateModel = async (model: AIModelConfig) => {
    try {
      const activated = await activateAIModel(model.id);
      setModels(models.map(m => ({
        ...m,
        is_active: m.id === activated.id
      })));
      showToast(`已激活 ${model.name}`, 'success');
    } catch (error) {
      showToast('激活失败，请重试', 'error');
    }
  };

  // Separate preset and custom models
  const presetModels = models.filter(m => m.is_preset);
  const customModels = models.filter(m => !m.is_preset);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[var(--memphis-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Add Dialog */}
      {showAddDialog && (
        <AddModelDialog
          onSave={handleCreateModel}
          onCancel={() => setShowAddDialog(false)}
          loading={saving}
          showToast={showToast}
        />
      )}

      {/* 页面标题 */}
      <h1 className="memphis-heading memphis-heading-lg">设置</h1>

      {/* AI 模型配置 */}
      <div className="memphis-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--memphis-primary)] border-2 border-[var(--memphis-dark)]">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <h2 className="memphis-heading memphis-heading-md">AI 模型配置</h2>
          </div>
          <button
            onClick={() => setShowAddDialog(true)}
            className="memphis-btn memphis-btn-accent flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加自定义模型
          </button>
        </div>

        <p className="text-[var(--memphis-dark)] opacity-80">
          配置 AI 模型用于智能分析素材内容、生成摘要和标签。每个模型的所有字段都可编辑。
        </p>

        {/* 预设模型 */}
        {presetModels.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--memphis-dark)] opacity-60">预设模型</h3>
            {presetModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onUpdate={handleUpdateModel}
                onDelete={handleDeleteModel}
                onActivate={handleActivateModel}
                showToast={showToast}
              />
            ))}
          </div>
        )}

        {/* 自定义模型 */}
        {customModels.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--memphis-dark)] opacity-60">自定义模型</h3>
            {customModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onUpdate={handleUpdateModel}
                onDelete={handleDeleteModel}
                onActivate={handleActivateModel}
                showToast={showToast}
              />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {models.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--memphis-accent1)] border-3 border-[var(--memphis-dark)] flex items-center justify-center">
              <Bot className="w-8 h-8 text-[var(--memphis-dark)]" />
            </div>
            <h3 className="memphis-heading text-lg mb-2">
              还没有配置 AI 模型
            </h3>
            <p className="text-[var(--memphis-dark)] opacity-60 mb-6">
              添加一个 AI 模型以启用智能素材分析功能
            </p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="memphis-btn memphis-btn-primary memphis-btn-lg"
            >
              添加第一个模型
            </button>
          </div>
        )}
      </div>

      {/* OCR 设置 */}
      {ocrStatus && (
        <div className="memphis-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--memphis-secondary)] border-2 border-[var(--memphis-dark)]">
              <Settings2 className="w-5 h-5 text-[var(--memphis-dark)]" />
            </div>
            <h2 className="memphis-heading memphis-heading-md">OCR 设置</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border-[var(--memphis-border-width)] border-[var(--memphis-dark)] rounded-[var(--memphis-radius)] bg-white">
              <h3 className="font-bold text-[var(--memphis-dark)] mb-2">LLM 视觉识别</h3>
              <p className="text-sm text-[var(--memphis-dark)] opacity-60 mb-2">使用大语言模型的视觉能力识别图片文字</p>
              <span className={`memphis-tag ${
                ocrStatus.llm_vision_available
                  ? 'memphis-tag-secondary'
                  : ''
              }`}>
                {ocrStatus.llm_vision_available ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    可用 ({ocrStatus.llm_provider_name})
                  </>
                ) : (
                  '未配置 AI 模型'
                )}
              </span>
            </div>
            
            <div className="p-4 border-[var(--memphis-border-width)] border-[var(--memphis-dark)] rounded-[var(--memphis-radius)] bg-white">
              <h3 className="font-bold text-[var(--memphis-dark)] mb-2">PaddleOCR</h3>
              <p className="text-sm text-[var(--memphis-dark)] opacity-60 mb-2">本地 OCR 引擎，无需网络连接</p>
              <span className={`memphis-tag ${
                ocrStatus.paddleocr_available
                  ? 'memphis-tag-secondary'
                  : ''
              }`}>
                {ocrStatus.paddleocr_available ? (
                  <>
                    <Check className="w-3 h-3 mr-1" />
                    可用 ({ocrStatus.paddleocr_engine})
                  </>
                ) : (
                  '未安装'
                )}
              </span>
            </div>
          </div>
          
          <p className="text-sm text-[var(--memphis-dark)] opacity-60">
            当前默认模式：<span className="font-bold text-[var(--memphis-dark)]">{ocrStatus.default_mode === 'llm_vision' ? 'LLM 视觉识别' : 'PaddleOCR'}</span>
          </p>
        </div>
      )}

      {/* 其他设置占位 */}
      <div className="memphis-card p-6">
        <h2 className="memphis-heading memphis-heading-md mb-4">其他设置</h2>
        <p className="text-[var(--memphis-dark)] opacity-60">更多设置选项将在后续版本中添加...</p>
      </div>
    </div>
  );
}

export default SettingsPage;
