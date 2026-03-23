import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lightbulb, Link, Image, Loader2, CheckCircle, AlertCircle, Upload, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createCard, parseLink, createCardFromLink, uploadScreenshot, getOCRStatus } from '../services/api';
import type { LinkParseResponse, OCRStatus } from '../types';

type TabType = 'text' | 'inspiration' | 'link' | 'screenshot';

// Memphis Toast component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100, y: 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className={`fixed top-4 right-4 z-50 memphis-toast ${
        type === 'success' ? 'memphis-toast-success' : 'memphis-toast-error'
      }`}
    >
      {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-80">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function CreatePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Text tab state
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textNote, setTextNote] = useState('');

  // Inspiration tab state
  const [inspirationTitle, setInspirationTitle] = useState('');
  const [inspirationContent, setInspirationContent] = useState('');
  const [inspirationNote, setInspirationNote] = useState('');

  // Link tab state
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPreview, setLinkPreview] = useState<LinkParseResponse | null>(null);
  const [linkParsing, setLinkParsing] = useState(false);

  // Screenshot tab state
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<string>('llm_vision');
  const [ocrStatus, setOcrStatus] = useState<OCRStatus | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: 'text' as TabType, label: '粘贴文本', icon: FileText },
    { id: 'inspiration' as TabType, label: '记录灵感', icon: Lightbulb },
    { id: 'link' as TabType, label: '网页链接', icon: Link },
    { id: 'screenshot' as TabType, label: '上传截图', icon: Image },
  ];

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle text submit
  const handleTextSubmit = async () => {
    if (!textContent.trim()) {
      showToast('请输入文本内容', 'error');
      return;
    }
    try {
      setLoading(true);
      const card = await createCard({
        card_type: 'text',
        title: textTitle || undefined,
        content: textContent,
        user_note: textNote || undefined,
      });
      showToast('素材创建成功', 'success');
      setTimeout(() => navigate(`/card/${card.id}`), 500);
    } catch (error) {
      showToast('创建失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle inspiration submit
  const handleInspirationSubmit = async () => {
    if (!inspirationContent.trim()) {
      showToast('请输入灵感内容', 'error');
      return;
    }
    try {
      setLoading(true);
      const card = await createCard({
        card_type: 'inspiration',
        title: inspirationTitle || undefined,
        content: inspirationContent,
        user_note: inspirationNote || undefined,
      });
      showToast('灵感记录成功', 'success');
      setTimeout(() => navigate(`/card/${card.id}`), 500);
    } catch (error) {
      showToast('创建失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle link parse
  const handleLinkParse = async () => {
    if (!linkUrl.trim()) {
      showToast('请输入链接地址', 'error');
      return;
    }
    try {
      setLinkParsing(true);
      const preview = await parseLink(linkUrl);
      if (preview.success) {
        setLinkPreview(preview);
      } else {
        showToast(preview.error || '链接解析失败', 'error');
      }
    } catch (error) {
      showToast('链接解析失败，请检查链接是否有效', 'error');
    } finally {
      setLinkParsing(false);
    }
  };

  // Handle link save
  const handleLinkSave = async () => {
    if (!linkUrl.trim()) return;
    try {
      setLoading(true);
      const card = await createCardFromLink(linkUrl);
      showToast('链接保存成功', 'success');
      setTimeout(() => navigate(`/card/${card.id}`), 500);
    } catch (error) {
      showToast('保存失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle file select
  const handleFileSelect = useCallback(async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('不支持的文件格式，请上传 PNG、JPG 或 WEBP 图片', 'error');
      return;
    }
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Fetch OCR status if not loaded
    if (!ocrStatus) {
      try {
        const status = await getOCRStatus();
        setOcrStatus(status);
        setOcrMode(status.default_mode);
      } catch (error) {
        console.error('获取 OCR 状态失败:', error);
      }
    }
  }, [ocrStatus]);

  // Handle drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Handle screenshot upload
  const handleScreenshotUpload = async () => {
    if (!screenshotFile) {
      showToast('请先选择图片', 'error');
      return;
    }
    try {
      setLoading(true);
      const card = await uploadScreenshot(screenshotFile, ocrMode);
      showToast('截图上传成功', 'success');
      setTimeout(() => navigate(`/card/${card.id}`), 500);
    } catch (error) {
      showToast('上传失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* 页面标题 */}
      <h1 className="memphis-heading memphis-heading-lg memphis-heading-shadow">新建素材</h1>

      {/* Memphis Tab 切换 */}
      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`memphis-btn ${
              activeTab === tab.id
                ? 'memphis-btn-accent'
                : 'bg-white hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </motion.button>
        ))}
      </div>

      {/* Tab 内容区域 - Memphis 卡片 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="memphis-card p-6"
        >
          {/* 粘贴文本 Tab */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <h3 className="memphis-heading memphis-heading-md">粘贴文本内容</h3>
              <input
                type="text"
                placeholder="标题（可选）"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="memphis-input"
              />
              <textarea
                placeholder="在这里粘贴您想要保存的文本内容..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                className="memphis-input memphis-textarea h-40"
              />
              <input
                type="text"
                placeholder="备注（可选）"
                value={textNote}
                onChange={(e) => setTextNote(e.target.value)}
                className="memphis-input"
              />
              <div className="flex justify-end">
                <motion.button
                  onClick={handleTextSubmit}
                  disabled={loading || !textContent.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-primary"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  保存素材
                </motion.button>
              </div>
            </div>
          )}

          {/* 记录灵感 Tab */}
          {activeTab === 'inspiration' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                {/* 灯泡图标区域加几何装饰 */}
                <div className="relative">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--memphis-accent1)', border: '3px solid var(--memphis-dark)' }}>
                    <Lightbulb className="w-6 h-6" style={{ color: 'var(--memphis-dark)' }} />
                  </div>
                  {/* 小圆点装饰 */}
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full"
                    style={{ background: 'var(--memphis-primary)', border: '2px solid var(--memphis-dark)' }} />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3"
                    style={{ background: 'var(--memphis-secondary)', border: '2px solid var(--memphis-dark)', transform: 'rotate(45deg)' }} />
                </div>
                <h3 className="memphis-heading memphis-heading-md">快速记录灵感</h3>
              </div>
              <p className="text-sm" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>
                闪现的灵感稍纵即逝，快速记录下来吧！
              </p>
              <input
                type="text"
                placeholder="给灵感起个标题（可选）"
                value={inspirationTitle}
                onChange={(e) => setInspirationTitle(e.target.value)}
                className="memphis-input memphis-input-accent"
              />
              <textarea
                placeholder="写下你的灵感..."
                value={inspirationContent}
                onChange={(e) => setInspirationContent(e.target.value)}
                className="memphis-input memphis-input-accent memphis-textarea h-32"
                autoFocus
              />
              <input
                type="text"
                placeholder="补充备注（可选）"
                value={inspirationNote}
                onChange={(e) => setInspirationNote(e.target.value)}
                className="memphis-input memphis-input-accent"
              />
              <div className="flex justify-end">
                <motion.button
                  onClick={handleInspirationSubmit}
                  disabled={loading || !inspirationContent.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-accent"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Lightbulb className="w-4 h-4" />
                  保存灵感
                </motion.button>
              </div>
            </div>
          )}

          {/* 网页链接 Tab */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              <h3 className="memphis-heading memphis-heading-md">添加网页链接</h3>
              <div className="flex gap-3">
                <input
                  type="url"
                  placeholder="粘贴网页链接，如：https://example.com/article"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkPreview(null);
                  }}
                  className="memphis-input flex-1"
                />
                <motion.button
                  onClick={handleLinkParse}
                  disabled={linkParsing || !linkUrl.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-secondary"
                >
                  {linkParsing && <Loader2 className="w-4 h-4 animate-spin" />}
                  解析预览
                </motion.button>
              </div>
              <p className="text-sm" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>
                支持解析微博、小红书、知乎等主流平台的内容
              </p>

              {/* 链接预览 - Memphis 风格 */}
              {linkPreview && linkPreview.success && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="memphis-card overflow-hidden"
                >
                  {linkPreview.cover_image && (
                    <img
                      src={linkPreview.cover_image}
                      alt=""
                      className="w-full h-48 object-cover"
                      style={{ borderBottom: '3px solid var(--memphis-dark)' }}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <div className="p-4 space-y-2">
                    <h4 className="font-bold" style={{ color: 'var(--memphis-dark)' }}>{linkPreview.title || '无标题'}</h4>
                    {linkPreview.description && (
                      <p className="text-sm line-clamp-3" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>{linkPreview.description}</p>
                    )}
                    <p className="text-xs truncate" style={{ color: 'var(--memphis-secondary)' }}>{linkPreview.source_url}</p>
                  </div>
                </motion.div>
              )}

              <div className="flex justify-end">
                <motion.button
                  onClick={handleLinkSave}
                  disabled={loading || !linkUrl.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-primary"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  保存为素材
                </motion.button>
              </div>
            </div>
          )}

          {/* 上传截图 Tab */}
          {activeTab === 'screenshot' && (
            <div className="space-y-4">
              <h3 className="memphis-heading memphis-heading-md">上传截图</h3>
              
              {/* Memphis 风格上传区域 */}
              <motion.div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ scale: 1.01 }}
                className="relative p-8 text-center cursor-pointer transition-all"
                style={{
                  border: '3px solid var(--memphis-dark)',
                  borderRadius: 'var(--memphis-radius)',
                  background: isDragging || screenshotPreview ? 'var(--memphis-bg-alt)' : 'white',
                  boxShadow: isDragging ? '6px 6px 0 var(--memphis-dark)' : '4px 4px 0 var(--memphis-dark)',
                }}
              >
                {/* 几何装饰 */}
                <div className="absolute top-3 left-3 w-6 h-6 rounded-full"
                  style={{ background: 'var(--memphis-primary)', border: '2px solid var(--memphis-dark)' }} />
                <div className="absolute top-3 right-3 w-5 h-5"
                  style={{ background: 'var(--memphis-secondary)', border: '2px solid var(--memphis-dark)', transform: 'rotate(45deg)' }} />
                <div className="absolute bottom-3 left-3 w-4 h-4"
                  style={{ background: 'var(--memphis-accent1)', border: '2px solid var(--memphis-dark)' }} />
                <div className="absolute bottom-3 right-3 w-6 h-3 rounded-full"
                  style={{ background: 'var(--memphis-accent4)', border: '2px solid var(--memphis-dark)' }} />

                {screenshotPreview ? (
                  <div className="space-y-4">
                    <img
                      src={screenshotPreview}
                      alt="预览"
                      className="max-h-64 mx-auto"
                      style={{ border: '3px solid var(--memphis-dark)', borderRadius: 'var(--memphis-radius)' }}
                    />
                    <p className="text-sm font-semibold" style={{ color: 'var(--memphis-dark)' }}>
                      {screenshotFile?.name}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setScreenshotFile(null);
                        setScreenshotPreview(null);
                      }}
                      className="memphis-btn memphis-btn-sm"
                      style={{ background: 'var(--memphis-error)', color: 'white' }}
                    >
                      <X className="w-4 h-4" />
                      移除图片
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--memphis-dark)' }} />
                    <p className="font-bold mb-2" style={{ color: 'var(--memphis-dark)' }}>
                      拖拽图片到这里，或点击选择文件
                    </p>
                    <p className="text-sm" style={{ color: 'var(--memphis-dark)', opacity: 0.6 }}>
                      支持 PNG、JPG、WEBP 格式
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
              </motion.div>

              {/* Memphis 风格 OCR 模式选择 */}
              {screenshotFile && (
                <div className="flex items-center gap-4 flex-wrap p-4 memphis-card">
                  <span className="font-bold" style={{ color: 'var(--memphis-dark)' }}>文字识别模式：</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setOcrMode('llm_vision')}
                      className="w-5 h-5 flex items-center justify-center"
                      style={{
                        border: '2px solid var(--memphis-dark)',
                        borderRadius: '50%',
                        background: ocrMode === 'llm_vision' ? 'var(--memphis-primary)' : 'white',
                      }}
                    >
                      {ocrMode === 'llm_vision' && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--memphis-dark)' }}>
                      LLM 视觉识别（推荐）
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setOcrMode('paddleocr')}
                      className="w-5 h-5 flex items-center justify-center"
                      style={{
                        border: '2px solid var(--memphis-dark)',
                        borderRadius: '50%',
                        background: ocrMode === 'paddleocr' ? 'var(--memphis-secondary)' : 'white',
                      }}
                    >
                      {ocrMode === 'paddleocr' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--memphis-dark)' }} />}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--memphis-dark)' }}>
                      PaddleOCR
                    </span>
                  </label>
                </div>
              )}

              <div className="flex justify-end">
                <motion.button
                  onClick={handleScreenshotUpload}
                  disabled={loading || !screenshotFile}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-primary"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  上传并识别
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default CreatePage;
