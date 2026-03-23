import { FileText, Link, Image, Lightbulb, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MaterialCard, CardType } from '../types';
import { parseAiTags, parseUserTags } from '../types';

interface CardPreviewProps {
  card: MaterialCard;
  onClick?: () => void;
}

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

// 孟菲斯风格配色
const typeColors: Record<CardType, { bg: string; text: string }> = {
  text: { bg: 'var(--memphis-primary)', text: 'var(--memphis-dark)' },
  link: { bg: 'var(--memphis-secondary)', text: 'var(--memphis-dark)' },
  screenshot: { bg: 'var(--memphis-accent4)', text: 'var(--memphis-dark)' },
  inspiration: { bg: 'var(--memphis-accent1)', text: 'var(--memphis-dark)' },
  platform: { bg: 'var(--memphis-accent2)', text: 'var(--memphis-dark)' },
};

function CardPreview({ card, onClick }: CardPreviewProps) {
  const Icon = typeIcons[card.card_type];
  const aiTags = parseAiTags(card);
  const userTags = parseUserTags(card);
  const displayTitle = card.title || card.content.slice(0, 30) + (card.content.length > 30 ? '...' : '');
  const colorConfig = typeColors[card.card_type];

  return (
    <motion.div
      onClick={onClick}
      className="memphis-card p-4 cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, rotate: -1 }}
      transition={{ duration: 0.2 }}
    >
      {/* 类型标签 + AI 状态 */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="memphis-tag flex items-center gap-1.5"
          style={{ backgroundColor: colorConfig.bg, color: colorConfig.text }}
        >
          <Icon className="w-3.5 h-3.5" />
          {typeLabels[card.card_type]}
        </span>
        {card.is_ai_processed ? (
          <span className="memphis-badge memphis-badge-success text-xs">AI 已处理</span>
        ) : (
          <span 
            className="memphis-badge text-xs memphis-stripe-pattern"
            style={{ background: '#e2e8f0' }}
          >
            待处理
          </span>
        )}
      </div>

      {/* 标题 */}
      <h3 className="font-bold text-[var(--memphis-dark)] mb-2 line-clamp-2">
        {displayTitle}
      </h3>

      {/* AI 摘要预览 */}
      {card.ai_summary && (
        <p className="text-sm text-[var(--memphis-dark)] opacity-70 line-clamp-2 mb-3">
          {card.ai_summary}
        </p>
      )}

      {/* 标签 */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {/* AI 标签 - 电光紫 */}
        {aiTags.slice(0, 2).map((tag, index) => (
          <span
            key={`ai-${index}`}
            className="memphis-tag text-xs"
            style={{ backgroundColor: 'var(--memphis-accent5)', color: 'white', padding: '2px 8px' }}
          >
            {tag}
          </span>
        ))}
        {/* 用户标签 - 薄荷绿 */}
        {userTags.slice(0, 2).map((tag, index) => (
          <span
            key={`user-${index}`}
            className="memphis-tag text-xs"
            style={{ backgroundColor: 'var(--memphis-secondary)', color: 'var(--memphis-dark)', padding: '2px 8px' }}
          >
            {tag}
          </span>
        ))}
        {(aiTags.length + userTags.length > 4) && (
          <span className="text-xs font-bold" style={{ color: 'var(--memphis-primary)' }}>
            +{aiTags.length + userTags.length - 4}
          </span>
        )}
      </div>

      {/* 封面图（链接和平台采集类型） */}
      {(card.card_type === 'link' || card.card_type === 'platform') && card.cover_image && (
        <div 
          className="mb-3 overflow-hidden memphis-border"
          style={{ borderRadius: 'var(--memphis-radius)' }}
        >
          <img
            src={card.cover_image}
            alt=""
            className="w-full h-24 object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      {/* 时间 */}
      <p className="text-xs font-medium" style={{ color: 'var(--memphis-dark)', opacity: 0.5 }}>
        {new Date(card.created_at).toLocaleDateString('zh-CN')}
      </p>
    </motion.div>
  );
}

export default CardPreview;
