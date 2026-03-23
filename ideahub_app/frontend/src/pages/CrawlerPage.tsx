import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Play, Square, RefreshCw, Download, Eye, X, CheckCircle, AlertCircle,
  Power, PowerOff, Wifi, WifiOff, FileText, Database, FolderOpen, Check
} from 'lucide-react';
import {
  startCrawlerService, stopCrawlerService, getCrawlerServiceStatus, getCrawlerEnvStatus,
  initCrawlerEnv, startCrawler, stopCrawler, getCrawlerStatus, getCrawlerPlatforms,
  getCrawlerDataFiles, previewImportData, importCrawlerData
} from '../services/api';
import type { CrawlerPlatform, CrawlerStartRequest, CrawlerDataFile } from '../types';

// Toast 组件 - Memphis Style
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  const toastClass = type === 'success' 
    ? 'memphis-toast-success' 
    : type === 'error' 
      ? 'memphis-toast-error' 
      : 'memphis-toast-info';
  
  return (
    <div className={`fixed top-4 right-4 z-50 memphis-toast ${toastClass}`}>
      {type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-80 transition-opacity">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// 预览弹窗 - Memphis Style
function PreviewModal({ 
  isOpen, 
  onClose, 
  filePath, 
  previews 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  filePath: string;
  previews: Array<{ title: string; content: string }>;
}) {
  if (!isOpen) return null;
  
  return (
    <div className="memphis-modal-overlay">
      <div className="memphis-modal p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="memphis-heading memphis-heading-md">数据预览</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[var(--memphis-primary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-[var(--memphis-dark)] opacity-60 mb-4 break-all memphis-tag">{filePath}</p>
        
        {previews.length === 0 ? (
          <p className="text-[var(--memphis-dark)] opacity-60 text-center py-8">暂无预览数据</p>
        ) : (
          <div className="space-y-4">
            {previews.map((item, index) => (
              <div key={index} className="memphis-card p-4">
                <h4 className="font-bold text-[var(--memphis-dark)] mb-2 line-clamp-2">{item.title || '无标题'}</h4>
                <p className="text-sm text-[var(--memphis-dark)] opacity-70 line-clamp-3">{item.content || '无内容'}</p>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="memphis-btn"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function CrawlerPage() {
  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 服务状态
  const [serviceStatus, setServiceStatus] = useState<{ running: boolean; healthy: boolean; pid: number | null }>({
    running: false, healthy: false, pid: null
  });
  const [envStatus, setEnvStatus] = useState<{ initialized: boolean; crawler_dir_exists: boolean }>({
    initialized: false, crawler_dir_exists: false
  });
  const [serviceLoading, setServiceLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  // 平台和配置
  const [platforms, setPlatforms] = useState<CrawlerPlatform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('xhs');
  const [crawlerType, setCrawlerType] = useState<'search' | 'detail' | 'creator'>('search');
  const [loginType, setLoginType] = useState<'qrcode' | 'cookie'>('qrcode');
  const [keywords, setKeywords] = useState('');
  const [specifiedIds, setSpecifiedIds] = useState('');
  const [creatorIds, setCreatorIds] = useState('');
  const [cookies, setCookies] = useState('');
  const [enableComments, setEnableComments] = useState(true);
  const [startPage, setStartPage] = useState(1);
  const [crawlerLoading, setCrawlerLoading] = useState(false);

  // 爬虫状态
  const [crawlerStatus, setCrawlerStatus] = useState<{ status: string; platform: string | null }>({
    status: 'idle', platform: null
  });
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WebSocket 日志
  const wsRef = useRef<WebSocket | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 数据文件
  const [dataFiles, setDataFiles] = useState<CrawlerDataFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; filePath: string; previews: Array<{ title: string; content: string }> }>({
    isOpen: false, filePath: '', previews: []
  });
  const [importingFile, setImportingFile] = useState<string | null>(null);

  // WebSocket 连接
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    const ws = new WebSocket(`ws://localhost:8000/api/ws/crawler-logs`);
    ws.onopen = () => {
      setWsConnected(true);
      setLogs(prev => [...prev, '[系统] WebSocket 已连接']);
    };
    ws.onmessage = (event) => {
      setLogs(prev => [...prev.slice(-500), event.data]);
    };
    ws.onclose = () => {
      setWsConnected(false);
      setLogs(prev => [...prev, '[系统] WebSocket 已断开']);
    };
    ws.onerror = () => {
      setWsConnected(false);
    };
    wsRef.current = ws;
  }, []);

  // 自动滚动日志
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 清理 WebSocket 和状态轮询
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
      }
    };
  }, []);

  // 爬虫状态轮询（当状态为 running 时每 2 秒轮询一次）
  useEffect(() => {
    if (crawlerStatus.status === 'running' && serviceStatus.running && serviceStatus.healthy) {
      statusPollRef.current = setInterval(async () => {
        try {
          const status = await getCrawlerStatus();
          setCrawlerStatus(status);
        } catch (error) {
          console.error('轮询爬虫状态失败:', error);
        }
      }, 2000);
    } else {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    }

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [crawlerStatus.status, serviceStatus.running, serviceStatus.healthy]);

  // 加载初始数据
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [statusRes, envRes, platformsRes] = await Promise.all([
          getCrawlerServiceStatus().catch(() => ({ running: false, healthy: false, pid: null })),
          getCrawlerEnvStatus().catch(() => ({ initialized: false, crawler_dir_exists: false })),
          getCrawlerPlatforms().catch(() => [])
        ]);
        setServiceStatus(statusRes);
        setEnvStatus(envRes);
        setPlatforms(platformsRes);
        
        // 如果服务运行中，连接 WebSocket 并获取爬虫状态
        if (statusRes.running && statusRes.healthy) {
          connectWebSocket();
          try {
            const crawlerRes = await getCrawlerStatus();
            setCrawlerStatus(crawlerRes);
          } catch {}
        }
      } catch (error) {
        console.error('加载初始数据失败:', error);
      }
    };
    loadInitialData();
    loadDataFiles();
  }, [connectWebSocket]);

  // 加载数据文件
  const loadDataFiles = async () => {
    setFilesLoading(true);
    try {
      const res = await getCrawlerDataFiles();
      setDataFiles(res.files || []);
    } catch (error) {
      console.error('加载数据文件失败:', error);
    } finally {
      setFilesLoading(false);
    }
  };

  // 启动服务
  const handleStartService = async () => {
    setServiceLoading(true);
    try {
      await startCrawlerService();
      showToast('服务启动成功', 'success');
      // 等待服务启动
      await new Promise(resolve => setTimeout(resolve, 2000));
      const status = await getCrawlerServiceStatus();
      setServiceStatus(status);
      if (status.running && status.healthy) {
        connectWebSocket();
      }
    } catch (error: any) {
      showToast(error.response?.data?.detail || '服务启动失败', 'error');
    } finally {
      setServiceLoading(false);
    }
  };

  // 停止服务
  const handleStopService = async () => {
    setServiceLoading(true);
    try {
      await stopCrawlerService();
      showToast('服务已停止', 'success');
      setServiceStatus({ running: false, healthy: false, pid: null });
      wsRef.current?.close();
    } catch (error: any) {
      showToast(error.response?.data?.detail || '停止服务失败', 'error');
    } finally {
      setServiceLoading(false);
    }
  };

  // 初始化环境
  const handleInitEnv = async () => {
    setInitLoading(true);
    try {
      await initCrawlerEnv();
      showToast('环境初始化成功', 'success');
      const envRes = await getCrawlerEnvStatus();
      setEnvStatus(envRes);
    } catch (error: any) {
      showToast(error.response?.data?.detail || '环境初始化失败', 'error');
    } finally {
      setInitLoading(false);
    }
  };

  // 开始采集
  const handleStartCrawler = async () => {
    if (!serviceStatus.running || !serviceStatus.healthy) {
      showToast('请先启动采集服务', 'error');
      return;
    }

    // 验证必填项
    if (crawlerType === 'search' && !keywords.trim()) {
      showToast('请输入搜索关键词', 'error');
      return;
    }
    if (crawlerType === 'detail' && !specifiedIds.trim()) {
      showToast('请输入内容ID列表', 'error');
      return;
    }
    if (crawlerType === 'creator' && !creatorIds.trim()) {
      showToast('请输入创作者ID列表', 'error');
      return;
    }
    if (loginType === 'cookie' && !cookies.trim()) {
      showToast('请输入Cookie', 'error');
      return;
    }

    setCrawlerLoading(true);
    try {
      const request: CrawlerStartRequest = {
        platform: selectedPlatform,
        login_type: loginType,
        crawler_type: crawlerType,
        keywords: keywords.trim(),
        specified_ids: specifiedIds.trim(),
        creator_ids: creatorIds.trim(),
        start_page: startPage,
        enable_comments: enableComments,
        enable_sub_comments: false,
        save_option: 'jsonl',
        cookies: cookies.trim(),
        headless: false
      };
      await startCrawler(request);
      showToast('采集任务已启动', 'success');
      setCrawlerStatus({ status: 'running', platform: selectedPlatform });
    } catch (error: any) {
      showToast(error.response?.data?.detail || '启动采集失败', 'error');
    } finally {
      setCrawlerLoading(false);
    }
  };

  // 停止采集
  const handleStopCrawler = async () => {
    setCrawlerLoading(true);
    try {
      const response = await stopCrawler();
      if (response.already_finished) {
        showToast('采集任务已完成', 'info');
      } else {
        showToast('采集任务已停止', 'success');
      }
      setCrawlerStatus({ status: 'idle', platform: null });
      // 刷新数据文件列表
      loadDataFiles();
    } catch (error: any) {
      showToast(error.response?.data?.detail || '停止采集失败', 'error');
    } finally {
      setCrawlerLoading(false);
    }
  };

  // 预览数据
  const handlePreview = async (filePath: string) => {
    try {
      const res = await previewImportData(filePath, 5);
      setPreviewModal({
        isOpen: true,
        filePath,
        previews: res.previews || []
      });
    } catch (error: any) {
      showToast(error.response?.data?.detail || '预览失败', 'error');
    }
  };

  // 导入数据
  const handleImport = async (filePath: string) => {
    setImportingFile(filePath);
    try {
      const res = await importCrawlerData(filePath);
      showToast(`导入成功: ${res.imported} 条, 跳过: ${res.skipped} 条, 失败: ${res.errors} 条`, 'success');
      loadDataFiles();
    } catch (error: any) {
      showToast(error.response?.data?.detail || '导入失败', 'error');
    } finally {
      setImportingFile(null);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 获取采集模式标签
  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'search': return '搜索';
      case 'detail': return '详情';
      case 'creator': return '创作者';
      default: return mode;
    }
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-green-500';
      case 'stopping': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const isServiceReady = serviceStatus.running && serviceStatus.healthy;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* 预览弹窗 */}
      <PreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, filePath: '', previews: [] })}
        filePath={previewModal.filePath}
        previews={previewModal.previews}
      />

      {/* 页面标题 */}
      <h1 className="memphis-heading memphis-heading-lg">平台采集</h1>

      {/* 服务状态栏 - Memphis Style */}
      <div className="memphis-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* 状态指示器 - 几何化设计 */}
            <div className={`w-12 h-12 rounded-[var(--memphis-radius)] border-[var(--memphis-border-width)] border-[var(--memphis-dark)] flex items-center justify-center ${
              isServiceReady 
                ? 'bg-[var(--memphis-secondary)]' 
                : 'bg-gray-200 memphis-stripe-pattern'
            }`}>
              {isServiceReady ? (
                <Wifi className="w-6 h-6 text-[var(--memphis-dark)]" />
              ) : (
                <WifiOff className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div>
              <h2 className="memphis-heading text-lg">MediaCrawler 服务</h2>
              <p className="text-sm text-[var(--memphis-dark)] opacity-60">
                <span className={`font-bold ${isServiceReady ? 'text-[var(--memphis-success)]' : 'text-gray-500'}`}>
                  {isServiceReady ? `运行中 (PID: ${serviceStatus.pid})` : '已停止'}
                </span>
                {!envStatus.initialized && ' · 环境未初始化'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!envStatus.initialized && (
              <button
                onClick={handleInitEnv}
                disabled={initLoading}
                className="memphis-btn memphis-btn-accent flex items-center gap-2"
              >
                {initLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                初始化环境
              </button>
            )}
            {isServiceReady ? (
              <button
                onClick={handleStopService}
                disabled={serviceLoading}
                className="memphis-btn bg-[var(--memphis-error)] text-white flex items-center gap-2"
              >
                {serviceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PowerOff className="w-4 h-4" />}
                停止服务
              </button>
            ) : (
              <button
                onClick={handleStartService}
                disabled={serviceLoading}
                className="memphis-btn memphis-btn-secondary flex items-center gap-2"
              >
                {serviceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                启动服务
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 采集配置区 - Memphis Style */}
      <div className="memphis-card p-6 space-y-6">
        <h2 className="memphis-heading text-lg">采集配置</h2>

        {/* 平台选择网格 */}
        <div>
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-3">选择平台</label>
          <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
            {platforms.map((platform) => (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                disabled={!isServiceReady}
                className={`flex flex-col items-center justify-center p-4 rounded-[var(--memphis-radius)] border-[var(--memphis-border-width)] transition-all ${
                  selectedPlatform === platform.id
                    ? 'border-[var(--memphis-primary)] bg-[rgba(255,107,107,0.1)] shadow-[3px_3px_0_var(--memphis-primary)]'
                    : 'border-[var(--memphis-dark)] hover:border-[var(--memphis-secondary)] hover:bg-[rgba(78,205,196,0.05)]'
                } ${!isServiceReady ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="text-2xl mb-1">{platform.icon}</span>
                <span className="text-sm font-bold text-[var(--memphis-dark)]">{platform.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 采集模式 - 孟菲斯风格 Radio */}
        <div>
          <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-3">采集模式</label>
          <div className="flex gap-3">
            {(['search', 'detail', 'creator'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCrawlerType(mode)}
                disabled={!isServiceReady}
                className={`px-5 py-2.5 rounded-[var(--memphis-radius)] border-[var(--memphis-border-width)] font-bold transition-all flex items-center gap-2 ${
                  crawlerType === mode
                    ? 'bg-[var(--memphis-primary)] text-white border-[var(--memphis-dark)] shadow-[3px_3px_0_var(--memphis-dark)]'
                    : 'bg-white border-[var(--memphis-dark)] text-[var(--memphis-dark)] hover:bg-[var(--memphis-bg)]'
                } ${!isServiceReady ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`w-4 h-4 rounded-full border-[3px] ${
                  crawlerType === mode 
                    ? 'border-white bg-[var(--memphis-dark)]' 
                    : 'border-[var(--memphis-dark)] bg-white'
                }`} />
                {getModeLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        {/* 参数输入 */}
        <div>
          {crawlerType === 'search' && (
            <div>
              <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">搜索关键词</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={!isServiceReady}
                placeholder="输入搜索关键词，多个用逗号分隔"
                className="memphis-input disabled:opacity-50 disabled:bg-gray-100"
              />
            </div>
          )}
          {crawlerType === 'detail' && (
            <div>
              <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">内容ID列表</label>
              <textarea
                value={specifiedIds}
                onChange={(e) => setSpecifiedIds(e.target.value)}
                disabled={!isServiceReady}
                placeholder="输入内容ID，每行一个或用逗号分隔"
                rows={3}
                className="memphis-input memphis-textarea disabled:opacity-50 disabled:bg-gray-100"
              />
            </div>
          )}
          {crawlerType === 'creator' && (
            <div>
              <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">创作者ID列表</label>
              <textarea
                value={creatorIds}
                onChange={(e) => setCreatorIds(e.target.value)}
                disabled={!isServiceReady}
                placeholder="输入创作者ID，每行一个或用逗号分隔"
                rows={3}
                className="memphis-input memphis-textarea disabled:opacity-50 disabled:bg-gray-100"
              />
            </div>
          )}
        </div>

        {/* 更多选项 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">登录方式</label>
            <select
              value={loginType}
              onChange={(e) => setLoginType(e.target.value as 'qrcode' | 'cookie')}
              disabled={!isServiceReady}
              className="memphis-input disabled:opacity-50 disabled:bg-gray-100"
            >
              <option value="qrcode">扫码登录</option>
              <option value="cookie">Cookie 登录</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">起始页码</label>
            <input
              type="number"
              value={startPage}
              onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
              disabled={!isServiceReady}
              min={1}
              className="memphis-input disabled:opacity-50 disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Cookie 输入 */}
        {loginType === 'cookie' && (
          <div>
            <label className="block text-sm font-bold text-[var(--memphis-dark)] mb-2">Cookie</label>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              disabled={!isServiceReady}
              placeholder="粘贴你的 Cookie..."
              rows={3}
              className="memphis-input memphis-textarea font-mono text-sm disabled:opacity-50 disabled:bg-gray-100"
            />
          </div>
        )}

        {/* 其他选项 */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={`w-6 h-6 rounded border-[3px] border-[var(--memphis-dark)] flex items-center justify-center transition-colors ${
              enableComments ? 'bg-[var(--memphis-secondary)]' : 'bg-white'
            }`}>
              {enableComments && <Check className="w-4 h-4 text-[var(--memphis-dark)]" />}
            </div>
            <input
              type="checkbox"
              checked={enableComments}
              onChange={(e) => setEnableComments(e.target.checked)}
              disabled={!isServiceReady}
              className="sr-only"
            />
            <span className="text-sm font-bold text-[var(--memphis-dark)]">采集评论</span>
          </label>
        </div>

        {/* 开始采集按钮 */}
        <div className="flex items-center justify-between pt-4 border-t-[3px] border-dashed border-[var(--memphis-dark)]">
          <div className="flex items-center gap-2 text-sm">
            <span className={`memphis-tag ${
              crawlerStatus.status === 'running' 
                ? 'memphis-tag-secondary' 
                : crawlerStatus.status === 'stopping' 
                  ? 'memphis-tag-accent' 
                  : ''
            }`}>
              {crawlerStatus.status === 'running' ? '采集中' : crawlerStatus.status === 'stopping' ? '正在停止' : '空闲'}
            </span>
            {crawlerStatus.platform && (
              <span className="text-[var(--memphis-dark)] opacity-60">
                ({platforms.find(p => p.id === crawlerStatus.platform)?.name || crawlerStatus.platform})
              </span>
            )}
          </div>
          <div className="flex gap-3">
            {crawlerStatus.status === 'running' ? (
              <button
                onClick={handleStopCrawler}
                disabled={crawlerLoading}
                className="memphis-btn bg-[var(--memphis-error)] text-white flex items-center gap-2"
              >
                {crawlerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                停止采集
              </button>
            ) : (
              <button
                onClick={handleStartCrawler}
                disabled={crawlerLoading || !isServiceReady}
                className="memphis-btn memphis-btn-primary flex items-center gap-2"
              >
                {crawlerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                开始采集
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 实时日志区 - Memphis Style */}
      <div className="memphis-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="memphis-heading text-lg">实时日志</h2>
            <span className="memphis-tag memphis-tag-accent text-xs">终端</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1 text-sm font-bold ${
              wsConnected ? 'text-[var(--memphis-success)]' : 'text-gray-400'
            }`}>
              {wsConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {wsConnected ? '已连接' : '未连接'}
            </span>
            <button
              onClick={() => setLogs([])}
              className="memphis-btn memphis-btn-sm memphis-btn-ghost"
            >
              清空日志
            </button>
          </div>
        </div>
        <div
          ref={logContainerRef}
          className="h-64 overflow-y-auto bg-gray-900 rounded-[var(--memphis-radius)] p-4 font-mono text-sm border-[var(--memphis-border-width)] border-[var(--memphis-secondary)]"
        >
          {logs.length === 0 ? (
            <p className="text-gray-500">暂无日志，启动服务后将显示实时日志...</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="text-green-400 whitespace-pre-wrap break-all">
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 数据导入区 - Memphis Style */}
      <div className="memphis-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="memphis-heading text-lg">已采集数据</h2>
          <button
            onClick={loadDataFiles}
            disabled={filesLoading}
            className="memphis-btn memphis-btn-sm flex items-center gap-2"
          >
            {filesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            刷新列表
          </button>
        </div>

        {filesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[var(--memphis-primary)] animate-spin" />
          </div>
        ) : dataFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-[var(--memphis-radius)] bg-[var(--memphis-accent1)] border-[var(--memphis-border-width)] border-[var(--memphis-dark)] flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-[var(--memphis-dark)]" />
            </div>
            <p className="font-bold text-[var(--memphis-dark)]">暂无已采集的数据文件</p>
            <p className="text-sm text-[var(--memphis-dark)] opacity-60 mt-1">完成采集任务后，数据文件将显示在这里</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--memphis-accent1)] border-[var(--memphis-border-width)] border-[var(--memphis-dark)]">
                  <th className="text-left py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">平台</th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">采集类型</th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">日期</th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">条数</th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">大小</th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-[var(--memphis-dark)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {dataFiles.map((file, index) => (
                  <tr key={index} className={`border-b-2 border-[var(--memphis-dark)] hover:bg-[var(--memphis-bg)] transition-colors ${
                    index % 2 === 1 ? 'bg-[rgba(255,248,240,0.5)]' : 'bg-white'
                  }`}>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[var(--memphis-dark)]">{file.platform_name}</span>
                    </td>
                    <td className="py-3 px-4 text-[var(--memphis-dark)] opacity-70">{file.item_type}</td>
                    <td className="py-3 px-4 text-[var(--memphis-dark)] opacity-70">{file.date}</td>
                    <td className="py-3 px-4 text-[var(--memphis-dark)] opacity-70">{file.line_count}</td>
                    <td className="py-3 px-4 text-[var(--memphis-dark)] opacity-70">{formatFileSize(file.file_size)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handlePreview(file.file_path)}
                          className="memphis-btn memphis-btn-sm flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          预览
                        </button>
                        <button
                          onClick={() => handleImport(file.file_path)}
                          disabled={importingFile === file.file_path}
                          className="memphis-btn memphis-btn-sm memphis-btn-primary flex items-center gap-1"
                        >
                          {importingFile === file.file_path ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          导入
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CrawlerPage;
