import axios from 'axios';
import type {
  MaterialCard,
  CardListResponse,
  CreateCardRequest,
  UpdateCardRequest,
  LinkParseResponse,
  AIModelConfig,
  CreateAIModelRequest,
  UpdateAIModelRequest,
  AIProcessRequest,
  AIProcessResponse,
  OCRStatus,
  TagsResponse,
  FetchModelsRequest,
  FetchModelsResponse,
  CrawlerPlatform,
  CrawlerStartRequest,
  CrawlerDataFile,
  ImportResult,
  CrawlerServiceStatus,
  CrawlerEnvStatus,
  AISearchResponse,
  AISearchResultCard,
} from '../types';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Card APIs
export const getCards = async (params?: {
  page?: number;
  page_size?: number;
  card_type?: string;
  search?: string;
  tag?: string;
  sort_by?: string;
  order?: string;
}): Promise<CardListResponse> => {
  const response = await api.get('/api/cards', { params });
  return response.data;
};

export const getCard = async (id: number): Promise<MaterialCard> => {
  const response = await api.get(`/api/cards/${id}`);
  return response.data;
};

export const createCard = async (data: CreateCardRequest): Promise<MaterialCard> => {
  const response = await api.post('/api/cards', data);
  return response.data;
};

export const updateCard = async (
  id: number,
  data: UpdateCardRequest
): Promise<MaterialCard> => {
  const response = await api.put(`/api/cards/${id}`, data);
  return response.data;
};

export const deleteCard = async (id: number): Promise<void> => {
  await api.delete(`/api/cards/${id}`);
};

export const getAllTags = async (): Promise<TagsResponse> => {
  const response = await api.get('/api/cards/tags');
  return response.data;
};

// AI Search API (legacy - kept for fallback)
export const aiSearch = async (query: string): Promise<AISearchResponse> => {
  const response = await api.get('/api/cards/ai-search', {
    params: { q: query },
  });
  return response.data;
};

// AI Search SSE Types
export interface AISearchStageEvent {
  stage: 'expanding' | 'expanded' | 'retrieving' | 'retrieved' | 'reranking';
  message: string;
  keywords?: string[];
  count?: number;
}

export interface AISearchDoneEvent {
  items: AISearchResultCard[];
  query: string;
  expanded_keywords: string[];
  total: number;
}

// AI Search SSE Stream API
export const aiSearchStream = (
  query: string,
  onStage: (event: AISearchStageEvent) => void,
  onDone: (result: AISearchDoneEvent) => void,
  onError: (message: string) => void,
): (() => void) => {
  const url = `/api/cards/ai-search?q=${encodeURIComponent(query)}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('stage', (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data);
      onStage(data);
    } catch {
      // ignore parse errors
    }
  });

  eventSource.addEventListener('done', (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data);
      onDone(data);
    } catch {
      // ignore parse errors
    }
    eventSource.close();
  });

  eventSource.addEventListener('error', (e) => {
    // Check if it's a custom SSE error event with data
    if (e instanceof MessageEvent && e.data) {
      try {
        const data = JSON.parse(e.data);
        onError(data.message || 'AI 搜索失败');
      } catch {
        onError('AI 搜索失败');
      }
    } else {
      onError('连接失败');
    }
    eventSource.close();
  });

  // Return cancel function
  return () => eventSource.close();
};

// Link APIs
export const createCardFromLink = async (url: string): Promise<MaterialCard> => {
  const response = await api.post('/api/cards/from-link', { url });
  return response.data;
};

export const parseLink = async (url: string): Promise<LinkParseResponse> => {
  const response = await api.post('/api/cards/parse-link', { url });
  return response.data;
};

// Screenshot APIs
export const uploadScreenshot = async (file: File, ocrMode?: string): Promise<MaterialCard> => {
  const formData = new FormData();
  formData.append('file', file);
  if (ocrMode) {
    formData.append('ocr_mode', ocrMode);
  }
  const response = await api.post('/api/cards/from-screenshot', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getOCRStatus = async (): Promise<OCRStatus> => {
  const response = await api.get('/api/cards/ocr-status');
  return response.data;
};

// AI Processing APIs
export const processAI = async (cardId: number, request?: AIProcessRequest): Promise<AIProcessResponse> => {
  const response = await api.post(`/api/ai/process/${cardId}`, request || {});
  return response.data;
};

export const batchProcessAI = async (cardIds: number[], actions?: string[]): Promise<{
  results: AIProcessResponse[];
  failed_ids: number[];
  errors: Record<number, string>;
}> => {
  const response = await api.post('/api/ai/process/batch', { card_ids: cardIds, actions });
  return response.data;
};

// AI Model APIs
export const getAIModels = async (): Promise<AIModelConfig[]> => {
  const response = await api.get('/api/ai/models');
  return response.data;
};

export const createAIModel = async (data: CreateAIModelRequest): Promise<AIModelConfig> => {
  const response = await api.post('/api/ai/models', data);
  return response.data;
};

export const updateAIModel = async (
  id: number,
  data: UpdateAIModelRequest
): Promise<AIModelConfig> => {
  const response = await api.put(`/api/ai/models/${id}`, data);
  return response.data;
};

export const deleteAIModel = async (id: number): Promise<void> => {
  await api.delete(`/api/ai/models/${id}`);
};

export const activateAIModel = async (id: number): Promise<AIModelConfig> => {
  const response = await api.put(`/api/ai/models/${id}/activate`);
  return response.data;
};

// Fetch available models for a saved model configuration
export const fetchAvailableModels = async (modelId: number): Promise<FetchModelsResponse> => {
  const response = await api.post<FetchModelsResponse>(`/api/ai/models/${modelId}/fetch-available-models`);
  return response.data;
};

// Fetch available models by temporary config (for creating new models)
export const fetchModelsByConfig = async (data: FetchModelsRequest): Promise<FetchModelsResponse> => {
  const response = await api.post<FetchModelsResponse>('/api/ai/fetch-models', data);
  return response.data;
};

// ===== Crawler APIs =====

// 服务管理
export const startCrawlerService = async () => {
  const response = await api.post('/api/crawler/service/start');
  return response.data;
};

export const stopCrawlerService = async () => {
  const response = await api.post('/api/crawler/service/stop');
  return response.data;
};

export const getCrawlerServiceStatus = async (): Promise<CrawlerServiceStatus> => {
  const response = await api.get('/api/crawler/service/status');
  return response.data;
};

export const getCrawlerEnvStatus = async (): Promise<CrawlerEnvStatus> => {
  const response = await api.get('/api/crawler/service/env-status');
  return response.data;
};

export const initCrawlerEnv = async () => {
  const response = await api.post('/api/crawler/service/init');
  return response.data;
};

// 爬虫任务
export const startCrawler = async (params: CrawlerStartRequest) => {
  const response = await api.post('/api/crawler/start', params);
  return response.data;
};

export const stopCrawler = async () => {
  const response = await api.post('/api/crawler/stop');
  return response.data;
};

export const getCrawlerStatus = async () => {
  const response = await api.get('/api/crawler/status');
  return response.data;
};

export const getCrawlerPlatforms = async (): Promise<CrawlerPlatform[]> => {
  const response = await api.get('/api/crawler/platforms');
  return response.data;
};

// 数据导入
export const getCrawlerDataFiles = async (): Promise<{ success: boolean; files: CrawlerDataFile[]; total: number }> => {
  const response = await api.get('/api/crawler/data-files');
  return response.data;
};

export const previewImportData = async (filePath: string, limit: number = 5) => {
  const response = await api.post('/api/crawler/import-preview', { file_path: filePath, limit });
  return response.data;
};

export const importCrawlerData = async (filePath: string): Promise<{ success: boolean } & ImportResult> => {
  const response = await api.post('/api/crawler/import', { file_path: filePath });
  return response.data;
};

export default api;
