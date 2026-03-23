import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Tag, FileText, ExternalLink, Loader2,
  Edit2, Save, X, Trash2, RefreshCw, Link, Image, Lightbulb,
  Clock, CheckCircle, AlertCircle, Plus, Download, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCard, updateCard, deleteCard, processAI } from '../services/api';
import type { MaterialCard, CardType } from '../types';
import { parseAiTags, parseUserTags } from '../types';

const typeIcons: Record<CardType, typeof FileText> = {
  text: FileText,
  link: Link,
  screenshot: Image,
  inspiration: Lightbulb,
  platform: Download,
};

const typeLabels: Record<CardType, string> = {
  text: '文本',
  link: '链接',
  screenshot: '截图',
  inspiration: '灵感',
  platform: '平台采集',
};

// Memphis 风格配色映射
const typeMemphisColors: Record<CardType, { bg: string; text: string }> = {
  text: { bg: 'var(--memphis-info)', text: 'white' },
  link: { bg: 'var(--memphis-secondary)', text: 'var(--memphis-dark)' },
  screenshot: { bg: 'var(--memphis-accent4)', text: 'var(--memphis-dark)' },
  inspiration: { bg: 'var(--memphis-accent1)', text: 'var(--memphis-dark)' },
  platform: { bg: 'var(--memphis-primary)', text: 'white' },
};

// Memphis Toast component
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
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

// Memphis Confirm dialog component
function ConfirmDialog({
  title, message, onConfirm, onCancel
}: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="memphis-modal-overlay"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="memphis-modal p-6 w-full max-w-md mx-4"
      >
        <h3 className="memphis-heading memphis-heading-md mb-2">{title}</h3>
        <p className="mb-6" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>{message}</p>
        <div className="flex justify-end gap-3">
          <motion.button
            onClick={onCancel}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="memphis-btn memphis-btn-ghost"
          >
            取消
          </motion.button>
          <motion.button
            onClick={onConfirm}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="memphis-btn"
            style={{ background: 'var(--memphis-error)', color: 'white' }}
          >
            确认删除
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [card, setCard] = useState<MaterialCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch card
  useEffect(() => {
    const fetchCard = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await getCard(parseInt(id));
        setCard(data);
        setEditTitle(data.title || '');
        setEditNote(data.user_note || '');
        setEditTags(parseUserTags(data));
      } catch (error) {
        showToast('获取素材详情失败', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchCard();
  }, [id]);

  // Handle AI process
  const handleAIProcess = async () => {
    if (!card) return;
    try {
      setProcessing(true);
      const result = await processAI(card.id);
      // Refresh card data
      const updated = await getCard(card.id);
      setCard(updated);
      showToast('AI 加工完成', 'success');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'AI 加工失败，请检查模型配置';
      showToast(message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!card) return;
    try {
      setSaving(true);
      const updated = await updateCard(card.id, {
        title: editTitle || undefined,
        user_note: editNote || undefined,
        user_tags: editTags.length > 0 ? JSON.stringify(editTags) : undefined,
      });
      setCard(updated);
      setIsEditing(false);
      showToast('保存成功', 'success');
    } catch (error) {
      showToast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!card) return;
    try {
      await deleteCard(card.id);
      showToast('删除成功', 'success');
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      showToast('删除失败，请重试', 'error');
    }
    setShowDeleteConfirm(false);
  };

  // Add tag
  const handleAddTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags([...editTags, newTag.trim()]);
      setNewTag('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--memphis-primary)' }} />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="text-center py-20">
        <p style={{ color: 'var(--memphis-dark)', opacity: 0.6 }}>素材不存在</p>
        <motion.button
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.02 }}
          className="mt-4 memphis-btn memphis-btn-secondary"
        >
          返回首页
        </motion.button>
      </div>
    );
  }

  const Icon = typeIcons[card.card_type];
  const aiTags = parseAiTags(card);
  const userTags = parseUserTags(card);
  const typeColor = typeMemphisColors[card.card_type];

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>
      
      {/* Delete confirm dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <ConfirmDialog
            title="确认删除"
            message="删除后无法恢复，确定要删除这个素材吗？"
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* 返回按钮和操作栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.button
          onClick={() => navigate(-1)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="memphis-btn memphis-btn-ghost"
        >
          <ArrowLeft className="w-5 h-5" />
          返回
        </motion.button>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <motion.button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(card.title || '');
                  setEditNote(card.user_note || '');
                  setEditTags(parseUserTags(card));
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="memphis-btn"
              >
                <X className="w-4 h-4" />
                取消
              </motion.button>
              <motion.button
                onClick={handleSave}
                disabled={saving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="memphis-btn memphis-btn-primary"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存
              </motion.button>
            </>
          ) : (
            <>
              <motion.button
                onClick={() => setIsEditing(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="memphis-btn memphis-btn-secondary"
              >
                <Edit2 className="w-4 h-4" />
                编辑
              </motion.button>
              <motion.button
                onClick={() => setShowDeleteConfirm(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="memphis-btn"
                style={{ background: 'var(--memphis-error)', color: 'white' }}
              >
                <Trash2 className="w-4 h-4" />
                删除
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* 详情卡片 - Memphis 风格 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="memphis-card p-6 space-y-6"
      >
        {/* 基本信息 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 类型标签 - Memphis Tag */}
            <span
              className="memphis-tag flex items-center gap-1.5"
              style={{ background: typeColor.bg, color: typeColor.text }}
            >
              <Icon className="w-4 h-4" />
              {typeLabels[card.card_type]}
            </span>
            {/* AI 状态徽章 - Memphis Badge */}
            {card.is_ai_processed && (
              <span className="memphis-badge memphis-badge-success flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AI 已加工
              </span>
            )}
          </div>

          {/* 标题 */}
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="输入标题..."
              className="memphis-input text-xl font-bold"
            />
          ) : (
            <h2 className="memphis-heading memphis-heading-md">
              {card.title || '无标题'}
            </h2>
          )}
        </div>

        {/* 截图显示（如果是截图类型） */}
        {card.card_type === 'screenshot' && card.screenshot_path && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
              <Image className="w-4 h-4" />
              原始截图
            </h3>
            <div className="overflow-hidden" style={{ border: '3px solid var(--memphis-dark)', borderRadius: 'var(--memphis-radius)' }}>
              <img
                src={card.screenshot_path}
                alt="截图"
                className="max-w-full h-auto"
              />
            </div>
          </div>
        )}

        {/* 封面图（如果是链接类型） */}
        {card.card_type === 'link' && card.cover_image && (
          <div className="overflow-hidden" style={{ border: '3px solid var(--memphis-dark)', borderRadius: 'var(--memphis-radius)' }}>
            <img
              src={card.cover_image}
              alt=""
              className="w-full h-48 object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        )}

        {/* 原始内容 - Memphis 风格 */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
            <FileText className="w-4 h-4" />
            原始内容
          </h3>
          <div
            className="p-4 whitespace-pre-wrap memphis-stripe-pattern-colorful"
            style={{
              border: '3px solid var(--memphis-dark)',
              borderRadius: 'var(--memphis-radius)',
              background: 'var(--memphis-bg)',
              color: 'var(--memphis-dark)',
            }}
          >
            {card.content}
          </div>
        </div>

        {/* 解析后内容（如果有） */}
        {card.parsed_content && card.parsed_content !== card.content && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
              <FileText className="w-4 h-4" />
              解析内容
            </h3>
            <div
              className="p-4 whitespace-pre-wrap"
              style={{
                border: '3px solid var(--memphis-dark)',
                borderRadius: 'var(--memphis-radius)',
                background: 'var(--memphis-bg)',
                color: 'var(--memphis-dark)',
              }}
            >
              {card.parsed_content}
            </div>
          </div>
        )}

        {/* 来源链接（如果有） */}
        {card.source_url && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
              <ExternalLink className="w-4 h-4" />
              来源
            </h3>
            <a
              href={card.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline break-all font-semibold"
              style={{ color: 'var(--memphis-secondary)' }}
            >
              {card.source_url}
            </a>
          </div>
        )}

        {/* 视频下载链接（如果有） */}
        {card.video_url && (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
              <Video className="w-4 h-4" />
              视频下载
            </h3>
            <motion.a
              href={card.video_url}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="memphis-btn memphis-btn-secondary inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              下载视频
            </motion.a>
          </div>
        )}

        {/* 用户备注 */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
            <Edit2 className="w-4 h-4" />
            备注
          </h3>
          {isEditing ? (
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="添加备注..."
              className="memphis-input memphis-textarea h-24"
            />
          ) : (
            <div
              className="p-4"
              style={{
                border: '3px solid var(--memphis-dark)',
                borderRadius: 'var(--memphis-radius)',
                background: 'var(--memphis-bg)',
                color: card.user_note ? 'var(--memphis-dark)' : 'var(--memphis-dark)',
                opacity: card.user_note ? 1 : 0.5,
              }}
            >
              {card.user_note || '暂无备注'}
            </div>
          )}
        </div>

        {/* 用户标签 - Memphis 风格 */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>
            <Tag className="w-4 h-4" />
            我的标签
          </h3>
          {isEditing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {editTags.map((tag) => (
                  <span
                    key={tag}
                    className="memphis-tag memphis-tag-secondary flex items-center gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:opacity-70"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="输入新标签..."
                  className="memphis-input flex-1"
                />
                <motion.button
                  onClick={handleAddTag}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="memphis-btn memphis-btn-secondary"
                >
                  <Plus className="w-4 h-4" />
                  添加
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {userTags.length > 0 ? (
                userTags.map((tag) => (
                  <span key={tag} className="memphis-tag memphis-tag-secondary">
                    {tag}
                  </span>
                ))
              ) : (
                <span style={{ color: 'var(--memphis-dark)', opacity: 0.5 }} className="text-sm">暂无标签</span>
              )}
            </div>
          )}
        </div>

        {/* 时间信息 - Memphis 分割线 */}
        <div className="memphis-divider-dashed" />
        <div className="flex items-center justify-between text-sm flex-wrap gap-2" style={{ color: 'var(--memphis-dark)', opacity: 0.7 }}>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            创建时间：{new Date(card.created_at).toLocaleString('zh-CN')}
          </span>
          <span>更新时间：{new Date(card.updated_at).toLocaleString('zh-CN')}</span>
        </div>
      </motion.div>

      {/* AI 加工区域 - Memphis 风格渐变 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative p-6 space-y-4 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, var(--memphis-accent1) 0%, var(--memphis-accent2) 50%, var(--memphis-accent4) 100%)',
          border: '3px solid var(--memphis-dark)',
          borderRadius: 'var(--memphis-radius-lg)',
          boxShadow: '6px 6px 0 var(--memphis-dark)',
        }}
      >
        {/* 几何装饰 */}
        <div className="absolute top-4 right-4 w-8 h-8 rounded-full opacity-50"
          style={{ background: 'var(--memphis-accent5)', border: '2px solid var(--memphis-dark)' }} />
        <div className="absolute bottom-4 left-4 w-6 h-6 opacity-50"
          style={{ background: 'var(--memphis-primary)', border: '2px solid var(--memphis-dark)', transform: 'rotate(45deg)' }} />

        <div className="flex items-center justify-between flex-wrap gap-3 relative z-10">
          <h3 className="flex items-center gap-2 memphis-heading memphis-heading-md">
            <Sparkles className="w-5 h-5" />
            AI 智能加工
          </h3>
          <motion.button
            onClick={handleAIProcess}
            disabled={processing}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="memphis-btn memphis-btn-purple"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                加工中...
              </>
            ) : card.is_ai_processed ? (
              <>
                <RefreshCw className="w-4 h-4" />
                重新生成
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                开始加工
              </>
            )}
          </motion.button>
        </div>

        {card.is_ai_processed ? (
          <div className="space-y-4 relative z-10">
            {/* AI 摘要 */}
            {card.ai_summary && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>AI 摘要</h4>
                <div className="memphis-card p-4" style={{ background: 'white' }}>
                  {card.ai_summary}
                </div>
              </div>
            )}

            {/* AI 标签 */}
            {aiTags.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>AI 标签</h4>
                <div className="flex flex-wrap gap-2">
                  {aiTags.map((tag) => (
                    <span key={tag} className="memphis-tag" style={{ background: 'var(--memphis-info)', color: 'white' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI 灵感建议 */}
            {card.ai_suggestions && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold" style={{ color: 'var(--memphis-dark)' }}>灵感建议</h4>
                <div className="memphis-card p-4 whitespace-pre-wrap" style={{ background: 'white' }}>
                  {card.ai_suggestions}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 relative z-10">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-16 h-16 mx-auto mb-3" style={{ color: 'var(--memphis-accent5)' }} />
            </motion.div>
            <p className="font-semibold" style={{ color: 'var(--memphis-dark)' }}>
              点击「开始加工」让 AI 为这个素材生成摘要、标签和灵感建议
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default DetailPage;
