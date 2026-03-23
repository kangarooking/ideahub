export type CardType = 'text' | 'link' | 'screenshot' | 'inspiration' | 'platform';

export interface MaterialCard {
  id: number;
  card_type: CardType;
  title: string | null;
  content: string;
  parsed_content: string | null;
  cover_image: string | null;
  source_url: string | null;
  source_platform: string | null;
  video_url: string | null;
  ai_summary: string | null;
  ai_tags: string | null; // JSON string from backend
  ai_suggestions: string | null;
  user_tags: string | null; // JSON string from backend
  user_note: string | null;
  screenshot_path: string | null;
  is_ai_processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CardListResponse {
  items: MaterialCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateCardRequest {
  card_type: string;
  title?: string;
  content: string;
  source_url?: string;
  source_platform?: string;
  user_note?: string;
  user_tags?: string; // JSON string
}

export interface UpdateCardRequest {
  title?: string;
  content?: string;
  user_note?: string;
  user_tags?: string; // JSON string
}

// Link parsing
export interface LinkParseRequest {
  url: string;
}

export interface LinkParseResponse {
  title: string | null;
  description: string | null;
  cover_image: string | null;
  content: string | null;
  source_url: string;
  success: boolean;
  error: string | null;
}

// AI Model Configuration
export interface AIModelConfig {
  id: number;
  name: string;
  provider_type: 'openai' | 'anthropic';
  base_url: string;
  api_key: string; // Masked from backend
  model_name: string;
  is_active: boolean;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAIModelRequest {
  name: string;
  provider_type: 'openai' | 'anthropic';
  base_url: string;
  api_key: string;
  model_name: string;
}

export interface UpdateAIModelRequest {
  name?: string;
  base_url?: string;
  api_key?: string;
  model_name?: string;
}

// AI Processing
export interface AIProcessRequest {
  actions?: string[];
}

export interface AIProcessResponse {
  card_id: number;
  ai_summary: string | null;
  ai_tags: string[] | null;
  ai_suggestions: string | null;
}

// OCR Status
export interface OCRStatus {
  paddleocr_available: boolean;
  paddleocr_engine: string | null;
  llm_vision_available: boolean;
  llm_provider_name: string | null;
  default_mode: string;
  supported_modes: string[];
}

// Tags response
export interface TagsResponse {
  tags: string[];
}

// Helper functions to parse JSON fields
export function parseAiTags(card: MaterialCard): string[] {
  if (!card.ai_tags) return [];
  try {
    return JSON.parse(card.ai_tags);
  } catch {
    return [];
  }
}

export function parseUserTags(card: MaterialCard): string[] {
  if (!card.user_tags) return [];
  try {
    return JSON.parse(card.user_tags);
  } catch {
    return [];
  }
}

// Available model from API
export interface AvailableModel {
  id: string;
  name: string;
}

// Fetch models request (for new model configuration)
export interface FetchModelsRequest {
  provider_type: string;
  base_url: string;
  api_key: string;
}

// Fetch models response
export interface FetchModelsResponse {
  models: AvailableModel[];
  source: 'api' | 'fallback' | 'error';
}

// Deprecated - keep for compatibility
export interface AIModel {
  id: number;
  name: string;
  provider: string;
  model_id: string;
  api_key: string;
  api_base_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ===== Crawler Types =====

// 平台信息
export interface CrawlerPlatform {
  id: string;
  name: string;
  icon: string;
  modes: string[];
}

// 爬虫启动请求
export interface CrawlerStartRequest {
  platform: string;
  login_type: 'qrcode' | 'phone' | 'cookie';
  crawler_type: 'search' | 'detail' | 'creator';
  keywords: string;
  specified_ids: string;
  creator_ids: string;
  start_page: number;
  enable_comments: boolean;
  enable_sub_comments: boolean;
  save_option: string;
  cookies: string;
  headless: boolean;
}

// 数据文件
export interface CrawlerDataFile {
  file_path: string;
  platform: string;
  platform_name: string;
  crawler_type: string;
  item_type: string;
  date: string;
  file_size: number;
  line_count: number;
}

// 导入结果
export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  error_details: string[];
}

// 服务状态
export interface CrawlerServiceStatus {
  running: boolean;
  healthy: boolean;
  pid: number | null;
  api_url: string;
}

// 环境状态
export interface CrawlerEnvStatus {
  crawler_dir_exists: boolean;
  initialized: boolean;
  data_dir: string;
  crawler_dir: string;
}

// ===== AI Search Types =====

// AI 搜索结果卡片（在 MaterialCard 基础上增加相关度信息）
export interface AISearchResultCard extends MaterialCard {
  relevance_score: number;
  relevance_reason: string;
}

// AI 搜索响应
export interface AISearchResponse {
  items: AISearchResultCard[];
  query: string;
  expanded_keywords: string[];
  total: number;
}
