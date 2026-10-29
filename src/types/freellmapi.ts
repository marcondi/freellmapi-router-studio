export type RoutingStrategy = 'auto' | 'auto:coding' | 'auto:smart' | 'auto:fast';

export type ProviderStatus = 'active' | 'rate_limited_429' | 'quota_exhausted' | 'disabled';

export interface ProviderEndpoint {
  id: string;
  platform: string;
  providerName: string;
  modelId: string;
  displayName: string;
  family: string;
  modality: 'chat' | 'embedding' | 'audio' | 'image';
  contextWindow: number;
  rpmLimit: number;
  tpmLimit: number;
  monthlyFreeTokens: number;
  usedTokens: number;
  tokenCapOverride: number | null; // Allows testing automatic quota exhaustion after N tokens
  status: ProviderStatus;
  cooldownUntil: number | null;
  intelligenceScore: number;
  speedTps: number;
  reliabilityPct: number;
  priority: number;
  supportsTools: boolean;
  supportsCodingHandoff: boolean;
  lastError?: string;
  requestsServed: number;
  failoversTriggered: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  routedVia?: string;
  handoffInjected?: boolean;
  handoffFrom?: string;
  timestamp?: string;
  attemptTrace?: AttemptStep[];
  tokensUsed?: number;
}

export interface AttemptStep {
  order: number;
  endpointId: string;
  platform: string;
  modelId: string;
  outcome: 'success' | 'http_429_rate_limit' | 'quota_cap_reached' | 'timeout';
  latencyMs: number;
  detail: string;
}

export interface HandoffEvent {
  id: string;
  timestamp: string;
  sessionKey: string;
  projectName: string;
  fromModel: string;
  toModel: string;
  reason: string;
  injectedTokens: number;
  handoffSystemPrompt: string;
}

export interface ProjectFile {
  path: string;
  language: string;
  content: string;
  lastUpdatedByModel: string;
  updatedAt: string;
}

export interface ProjectStep {
  id: string;
  stepNumber: number;
  title: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed';
  completedByModel?: string;
  handoffOccurred?: boolean;
  handoffFromModel?: string;
}

export interface ContinuityProject {
  id: string;
  sessionKey: string;
  name: string;
  description: string;
  strategy: RoutingStrategy;
  contextHandoffMode: 'full_project_state' | 'summary_only' | 'off';
  lastActiveModel?: string;
  messages: ChatMessage[];
  files: ProjectFile[];
  steps: ProjectStep[];
  totalTokensUsed: number;
  totalHandoffs: number;
  createdAt: string;
}

export interface RouterStateResponse {
  strategy: RoutingStrategy;
  contextHandoffMode: 'full_project_state' | 'summary_only' | 'off';
  unifiedEndpointUrl: string;
  catalogSummary: {
    totalProviders: number;
    modelFamilies: number;
    freeEndpoints: number;
    monthlyTokenCapacity: number;
    usedMonthlyTokens: number;
  };
  endpoints: ProviderEndpoint[];
  handoffHistory: HandoffEvent[];
  recentRequests: {
    id: string;
    timestamp: string;
    sessionKey: string;
    requestedModel: string;
    routedVia: string;
    status: number;
    tokens: number;
    latencyMs: number;
    handoffInjected: boolean;
    attempts: AttemptStep[];
  }[];
}
