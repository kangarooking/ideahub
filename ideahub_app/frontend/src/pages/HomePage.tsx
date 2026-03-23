import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, FolderOpen, Plus, Loader2, Tag, ChevronLeft, ChevronRight, Triangle, Circle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCards, getAllTags, aiSearchStream } from '../services/api';
import type { MaterialCard, AISearchResponse } from '../types';
import CardPreview from '../components/CardPreview';

function HomePage() {
  const navigate = useNavigate();
  
  // State
  const [cards, setCards] = useState<MaterialCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 12;

  // AI Search State
  const [isAIMode, setIsAIMode] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResults, setAiResults] = useState<AISearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStage, setAiStage] = useState<string>('');       // 当前阶段描述
  const [aiKeywords, setAiKeywords] = useState<string[]>([]); // 实时显示的扩展关键词
  const [aiCandidateCount, setAiCandidateCount] = useState<number>(0); // 候选数量
  const cancelRef = useRef<(() => void) | null>(null);        // SSE 取消函数

  const cardTypes = [
    { value: '', label: '全部类型' },
    { value: 'text', label: '文本' },
    { value: 'link', label: '链接' },
    { value: 'screenshot', label: '截图' },
    { value: 'inspiration', label: '灵感' },
    { value: 'platform', label: '平台采集' },
  ];

  // Fetch cards
  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getCards({
        page,
        page_size: pageSize,
        search: searchKeyword || undefined,
        card_type: selectedType || undefined,
        tag: selectedTag || undefined,
        sort_by: 'created_at',
        order: 'desc',
      });
      setCards(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('获取卡片失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchKeyword, selectedType, selectedTag]);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const response = await getAllTags();
      setAllTags(response.tags);
    } catch (error) {
      console.error('获取标签失败:', error);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchCards();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword, selectedType, selectedTag]);

  // Page change
  useEffect(() => {
    fetchCards();
  }, [page]);

  // AI Search handler with SSE
  const handleAISearch = () => {
    if (!aiSearchQuery.trim()) return;
    
    // 取消之前的搜索
    if (cancelRef.current) {
      cancelRef.current();
    }
    
    setAiSearching(true);
    setAiError(null);
    setAiResults(null);
    setAiStage('');
    setAiKeywords([]);
    setAiCandidateCount(0);
    
    const cancel = aiSearchStream(
      aiSearchQuery.trim(),
      // onStage
      (event) => {
        setAiStage(event.message);
        if (event.stage === 'expanded' && event.keywords) {
          setAiKeywords(event.keywords);
        }
        if (event.stage === 'retrieved' && event.count !== undefined) {
          setAiCandidateCount(event.count);
        }
      },
      // onDone
      (result) => {
        setAiResults(result);
        setAiSearching(false);
        setAiStage('');
      },
      // onError
      (message) => {
        setAiError(message);
        setAiSearching(false);
        setAiStage('');
      },
    );
    
    cancelRef.current = cancel;
  };

  // 组件卸载时清理 SSE 连接
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
    };
  }, []);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="memphis-heading memphis-heading-lg">我的素材库</h1>
        <button
          onClick={() => navigate('/create')}
          className="memphis-btn memphis-btn-primary"
        >
          <Plus className="w-4 h-4" />
          新建素材
        </button>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--memphis-dark)', opacity: 0.5 }} />
          {isAIMode ? (
            <input
              type="text"
              placeholder="用自然语言描述你想找的素材..."
              value={aiSearchQuery}
              onChange={(e) => setAiSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAISearch();
              }}
              className="memphis-input pl-11"
              style={{ borderColor: 'var(--memphis-accent5)', boxShadow: '3px 3px 0 var(--memphis-accent5)' }}
            />
          ) : (
            <input
              type="text"
              placeholder="搜索素材..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="memphis-input pl-11"
            />
          )}
        </div>

        {/* AI 搜索切换按钮 */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            // 切换模式时取消正在进行的 SSE
            if (cancelRef.current) {
              cancelRef.current();
              cancelRef.current = null;
            }
            setIsAIMode(!isAIMode);
            setAiResults(null);
            setAiError(null);
            setAiSearching(false);
            setAiStage('');
            setAiKeywords([]);
            setAiCandidateCount(0);
          }}
          className={`memphis-btn ${isAIMode ? 'memphis-btn-accent' : ''}`}
          style={isAIMode ? { color: 'var(--memphis-accent5)' } : {}}
        >
          <Sparkles size={16} />
          <span className="hidden md:inline">AI</span>
        </motion.button>

        {/* 筛选器（仅在非 AI 模式显示） */}
        {!isAIMode && (
          <div className="flex items-center gap-3">
          {/* 类型筛选 */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" style={{ color: 'var(--memphis-primary)' }} />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="memphis-input py-2 cursor-pointer"
              style={{ minWidth: '120px' }}
            >
              {cardTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* 标签筛选 */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5" style={{ color: 'var(--memphis-secondary)' }} />
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="memphis-input memphis-input-secondary py-2 cursor-pointer"
                style={{ minWidth: '120px' }}
              >
                <option value="">全部标签</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        )}
      </div>

      {/* 内容区域 */}
      {isAIMode ? (
        /* AI 搜索模式 */
        <>
          {/* AI 搜索错误 */}
          {aiError && (
            <div className="memphis-card p-4 mb-4" style={{ borderColor: 'var(--memphis-error)' }}>
              <p style={{ color: 'var(--memphis-error)' }}>{aiError}</p>
            </div>
          )}

          {/* AI 搜索中的加载状态 - 实时进度展示 */}
          {aiSearching && (
            <div className="memphis-card p-6 mb-6">
              {/* 进度指示器 */}
              <div className="flex items-center gap-3 mb-4">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Sparkles size={24} style={{ color: 'var(--memphis-accent5)' }} />
                </motion.div>
                <span className="text-lg font-bold" style={{ color: 'var(--memphis-dark)' }}>
                  {aiStage || '正在启动 AI 搜索...'}
                </span>
              </div>

              {/* 实时显示扩展关键词（阶段1完成后） */}
              {aiKeywords.length > 0 && (
                <div className="mb-3">
                  <span className="text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
                    AI 理解：
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {aiKeywords.map((kw, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="memphis-tag"
                        style={{ background: 'var(--memphis-accent2)' }}
                      >
                        {kw}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}

              {/* 候选数量（阶段2完成后） */}
              {aiCandidateCount > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm"
                  style={{ color: 'var(--memphis-dark)' }}
                >
                  从 {aiCandidateCount} 个候选素材中进行语义排序...
                </motion.div>
              )}
            </div>
          )}

          {/* AI 搜索结果 */}
          {aiResults && !aiSearching && (
            <>
              {/* 扩展关键词 */}
              {aiResults.expanded_keywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
                    AI 理解：
                  </span>
                  {aiResults.expanded_keywords.map((kw, i) => (
                    <span key={i} className="memphis-tag" style={{ background: 'var(--memphis-accent2)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {/* 结果数量 */}
              <div className="text-sm font-semibold mb-4" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>
                找到 {aiResults.total} 个相关素材
              </div>

              {/* 结果卡片 */}
              {aiResults.items.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {aiResults.items.map((card, index) => (
                    <motion.div
                      key={card.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative"
                    >
                      {/* 相关度分数徽章 */}
                      <div
                        className="absolute -top-2 -right-2 z-10 memphis-badge px-2 py-1"
                        style={{ background: 'var(--memphis-accent1)', border: '2px solid var(--memphis-dark)' }}
                        title={card.relevance_reason}
                      >
                        {card.relevance_score}分
                      </div>
                      <CardPreview card={card} onClick={() => navigate(`/card/${card.id}`)} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-lg font-bold" style={{ color: 'var(--memphis-dark)' }}>
                    没有找到与 "{aiResults.query}" 相关的素材
                  </p>
                </div>
              )}
            </>
          )}

          {/* AI 模式初始状态 */}
          {!aiSearching && !aiResults && !aiError && (
            <div className="flex flex-col items-center justify-center py-20 text-center relative">
              <div className="absolute top-8 left-1/4">
                <Triangle className="w-6 h-6" style={{ color: 'var(--memphis-accent5)', fill: 'var(--memphis-accent5)' }} />
              </div>
              <div className="absolute top-16 right-1/4">
                <Circle className="w-4 h-4" style={{ color: 'var(--memphis-accent1)', fill: 'var(--memphis-accent1)' }} />
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 memphis-border"
                style={{ backgroundColor: 'var(--memphis-accent1)' }}
              >
                <Sparkles className="w-10 h-10" style={{ color: 'var(--memphis-accent5)' }} />
              </motion.div>
              <h3 className="memphis-heading text-lg mb-2">
                AI 语义搜索
              </h3>
              <p className="mb-2" style={{ color: 'var(--memphis-dark)', opacity: 0.6 }}>
                用自然语言描述你想找的内容，按回车搜索
              </p>
              <p className="text-sm" style={{ color: 'var(--memphis-accent5)', fontWeight: 600 }}>
                例如：“关于 AI 学习方法的素材”、“产品设计灵感”
              </p>
            </div>
          )}
        </>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 
            className="w-10 h-10 animate-spin" 
            style={{ color: 'var(--memphis-primary)' }} 
          />
        </div>
      ) : cards.length === 0 ? (
        /* 空状态提示 */
        <div className="flex flex-col items-center justify-center py-20 text-center relative">
          {/* 几何装饰 */}
          <div className="absolute top-8 left-1/4">
            <Triangle className="w-6 h-6" style={{ color: 'var(--memphis-secondary)', fill: 'var(--memphis-secondary)' }} />
          </div>
          <div className="absolute top-16 right-1/4">
            <Circle className="w-4 h-4" style={{ color: 'var(--memphis-accent1)', fill: 'var(--memphis-accent1)' }} />
          </div>
          <div className="absolute bottom-12 left-1/3">
            <div 
              className="w-5 h-5 transform rotate-12" 
              style={{ backgroundColor: 'var(--memphis-primary)', border: '2px solid var(--memphis-dark)' }}
            />
          </div>
          
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 memphis-border"
            style={{ backgroundColor: 'var(--memphis-bg-alt)' }}
          >
            <FolderOpen className="w-10 h-10" style={{ color: 'var(--memphis-dark)' }} />
          </div>
          <h3 className="memphis-heading text-lg mb-2">
            {searchKeyword || selectedType || selectedTag
              ? '没有找到匹配的素材'
              : '还没有任何素材'}
          </h3>
          <p className="mb-6" style={{ color: 'var(--memphis-dark)', opacity: 0.6 }}>
            {searchKeyword || selectedType || selectedTag
              ? '尝试调整搜索条件或筛选器'
              : '点击上方「新建素材」按钮，开始收集你的第一个灵感吧！'}
          </p>
          {!searchKeyword && !selectedType && !selectedTag && (
            <button
              onClick={() => navigate('/create')}
              className="memphis-btn memphis-btn-secondary memphis-btn-lg"
            >
              创建第一个素材
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence>
              {cards.map((card, index) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                >
                  <CardPreview
                    card={card}
                    onClick={() => navigate(`/card/${card.id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="memphis-btn memphis-btn-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </button>
              <span 
                className="memphis-tag px-4 py-2 font-bold"
                style={{ backgroundColor: 'var(--memphis-accent1)', color: 'var(--memphis-dark)' }}
              >
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="memphis-btn memphis-btn-sm"
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 统计信息 */}
          <div className="text-center text-sm font-semibold" style={{ color: 'var(--memphis-dark)', opacity: 0.6 }}>
            共 {total} 个素材
          </div>
        </>
      )}
    </div>
  );
}

export default HomePage;
