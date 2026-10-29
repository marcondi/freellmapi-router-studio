import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Terminal,
  FolderGit2,
  FileCode2,
  GitBranch,
  Sliders,
  Search,
  ChevronRight,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import type {
  RouterStateResponse,
  ProviderEndpoint,
  RoutingStrategy,
  ContinuityProject,
  ProjectFile,
  AttemptStep,
} from './types/freellmapi';

const INITIAL_PROJECTS: ContinuityProject[] = [
  {
    id: 'proj-saas-billing',
    sessionKey: 'session-saas-gateway-01',
    name: 'Plataforma SaaS de Pagamentos & Split',
    description:
      'Projeto full-stack dividido em 4 etapas. Se a IA atual atingir limite de créditos (HTTP 429), a próxima IA da cadeia recebe o pacote FreeLLMAPI Context Handoff com os arquivos já gerados e continua exatamente de onde parou.',
    strategy: 'auto:coding',
    contextHandoffMode: 'full_project_state',
    messages: [],
    files: [
      {
        path: 'README.md',
        language: 'markdown',
        content: `# Plataforma SaaS de Pagamentos\n\nEste projeto é gerenciado pelo FreeLLMAPI Continuity Router.\nArquivos gerados pelas IAs da cadeia de failover aparecem automaticamente aqui.`,
        lastUpdatedByModel: 'freellmapi/init',
        updatedAt: new Date().toISOString(),
      },
    ],
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: '01. Modelagem de Dados e Tipagem TypeScript',
        prompt:
          'Crie o arquivo `src/types/billing.ts` contendo as interfaces TypeScript completas para Clientes, Assinaturas, Transações PIX/Cartão e Regras de Split de Pagamento. Responda com o bloco de código completo.',
        status: 'pending',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: '02. Motor de Processamento e Divisão de Receita (Split)',
        prompt:
          'Continuando o projeto e usando as tipagens de `src/types/billing.ts`, crie o serviço `src/services/splitEngine.ts` que calcula taxas do gateway, retém impostos e distribui os centavos exatos entre recebedores sem erro de arredondamento.',
        status: 'pending',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: '03. Endpoint REST de Checkout e Idempotência',
        prompt:
          'Dando continuidade ao projeto e integrando o `splitEngine.ts`, crie o controlador `src/routes/checkoutController.ts` com validação de payload, chave de idempotência e emissão de comprovante estruturado.',
        status: 'pending',
      },
      {
        id: 'step-4',
        stepNumber: 4,
        title: '04. Suite de Testes de Tolerância a Falhas',
        prompt:
          'Para finalizar o projeto, crie `src/tests/billing.spec.ts` testando os fluxos criados nas etapas anteriores (cálculo de split exato, prevenção de cobrança duplicada e estorno parcial).',
        status: 'pending',
      },
    ],
    totalTokensUsed: 0,
    totalHandoffs: 0,
    createdAt: new Date().toISOString(),
  },
];

function extractCodeFilesFromResponse(
  markdown: string,
  defaultPath: string,
  routedVia: string
): ProjectFile[] {
  const extracted: ProjectFile[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  // Try to detect file path mentioned in prompt or markdown
  const pathHintMatch = markdown.match(/`((?:src\/|[a-zA-Z0-9_-]+\/)[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/);

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lang = match[1] || 'typescript';
    const content = match[2].trim();
    if (content.length < 20) continue;

    const firstLine = content.split('\n')[0];
    const commentPathMatch = firstLine.match(/(?:\/\/|#)\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/);

    const filePath =
      commentPathMatch?.[1] ||
      (blockIndex === 0 && pathHintMatch ? pathHintMatch[1] : null) ||
      (blockIndex === 0 ? defaultPath : `src/module_${Date.now().toString().slice(-4)}_${blockIndex}.ts`);

    extracted.push({
      path: filePath,
      language: lang,
      content,
      lastUpdatedByModel: routedVia,
      updatedAt: new Date().toISOString(),
    });
    blockIndex++;
  }

  return extracted;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<'continuity' | 'failover' | 'catalog' | 'connect'>('continuity');
  const [routerState, setRouterState] = useState<RouterStateResponse | null>(null);
  const [loadingState, setLoadingState] = useState<boolean>(true);

  // Project Continuity Studio state
  const [projects, setProjects] = useState<ContinuityProject[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState<string>(INITIAL_PROJECTS[0].id);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('README.md');
  const [customTaskInput, setCustomTaskInput] = useState<string>('');
  const [newProjectTitle, setNewProjectTitle] = useState<string>('');
  const [showNewProjectForm, setShowNewProjectForm] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [autoExhaustAfterTurn, setAutoExhaustAfterTurn] = useState<boolean>(true);
  const [lastAttemptTrace, setLastAttemptTrace] = useState<AttemptStep[]>([]);
  const [activeHandoffInspector, setActiveHandoffInspector] = useState<string | null>(null);

  // Catalog filter state
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<'all' | 'active' | 'exhausted'>('all');

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) || projects[0];
  const selectedFile =
    activeProject.files.find((f) => f.path === selectedFilePath) || activeProject.files[0];

  const fetchRouterState = useCallback(async () => {
    try {
      const res = await fetch('/api/router/state');
      if (res.ok) {
        const data: RouterStateResponse = await res.json();
        setRouterState(data);
      }
    } catch (e) {
      console.error('Failed to load router state:', e);
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchRouterState();
  }, [fetchRouterState]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleStrategyChange = async (strategy: RoutingStrategy) => {
    await fetch('/api/router/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy }),
    });
    await fetchRouterState();
  };

  const handleHandoffModeChange = async (
    contextHandoffMode: 'full_project_state' | 'summary_only' | 'off'
  ) => {
    await fetch('/api/router/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextHandoffMode }),
    });
    await fetchRouterState();
  };

  const handleEndpointControl = async (
    endpointId: string,
    payload: {
      status?: ProviderEndpoint['status'];
      tokenCapOverride?: number | null;
      direction?: 'up' | 'down';
    }
  ) => {
    await fetch(`/api/router/endpoint/${endpointId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await fetchRouterState();
  };

  const handleResetAllQuotas = async () => {
    await fetch('/api/router/reset-quotas', { method: 'POST' });
    await fetchRouterState();
  };

  // Exhaust the currently active #1 provider to demonstrate immediate failover & handoff
  const handleSimulateCurrentProviderExhaustion = async () => {
    if (!routerState) return;
    const firstActive = routerState.endpoints.find((e) => e.status === 'active');
    if (firstActive) {
      await handleEndpointControl(firstActive.id, { status: 'rate_limited_429' });
    }
  };

  // Run a single project step or custom prompt through /v1/chat/completions
  const executeProjectPrompt = async (
    promptText: string,
    stepId?: string,
    expectedDefaultFilePath = 'src/module.ts'
  ) => {
    if (isExecuting || !promptText.trim()) return;
    setIsExecuting(true);

    try {
      // Mark step as running if applicable
      if (stepId) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === activeProject.id
              ? {
                  ...p,
                  steps: p.steps.map((s) => (s.id === stepId ? { ...s, status: 'running' } : s)),
                }
              : p
          )
        );
      }

      const filesSummary = activeProject.files
        .map(
          (f) =>
            `- ${f.path} (updated by ${f.lastUpdatedByModel}):\n${f.content.slice(0, 600)}${
              f.content.length > 600 ? '\n...[truncated]' : ''
            }`
        )
        .join('\n\n');

      const outgoingMessages = [
        {
          role: 'system' as const,
          content: `Projeto Ativo: ${activeProject.name}. Descrição: ${activeProject.description}. Gere código limpo, modular e bem estruturado em blocos markdown com o nome do arquivo no comentário da primeira linha.`,
        },
        ...activeProject.messages,
        {
          role: 'user' as const,
          content: promptText,
        },
      ];

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Key': activeProject.sessionKey,
          'X-Project-Name': activeProject.name,
        },
        body: JSON.stringify({
          model: routerState?.strategy || 'auto:coding',
          messages: outgoingMessages,
          session_key: activeProject.sessionKey,
          project_name: activeProject.name,
          project_files_summary: filesSummary,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Erro ao processar requisição no roteador');
      }

      const replyText: string = data.choices?.[0]?.message?.content || '';
      const meta = data.freellmapi_meta || {};
      const routedVia: string = meta.routed_via || data.model || 'google/gemini-3.8-flash';
      const handoffInjected: boolean = Boolean(meta.handoff_injected);
      const handoffFrom: string | undefined = meta.handoff_from || undefined;
      const attempts: AttemptStep[] = meta.attempts || [];
      const tokensUsed: number = data.usage?.total_tokens || 250;

      setLastAttemptTrace(attempts);
      if (meta.handoff_system_prompt) {
        setActiveHandoffInspector(meta.handoff_system_prompt);
      }

      const extractedFiles = extractCodeFilesFromResponse(
        replyText,
        expectedDefaultFilePath,
        routedVia
      );

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== activeProject.id) return p;

          const updatedFiles = [...p.files];
          for (const ef of extractedFiles) {
            const existingIdx = updatedFiles.findIndex((f) => f.path === ef.path);
            if (existingIdx >= 0) {
              updatedFiles[existingIdx] = ef;
            } else {
              updatedFiles.push(ef);
            }
          }

          return {
            ...p,
            lastActiveModel: routedVia,
            totalTokensUsed: p.totalTokensUsed + tokensUsed,
            totalHandoffs: p.totalHandoffs + (handoffInjected ? 1 : 0),
            files: updatedFiles,
            messages: [
              ...p.messages,
              {
                role: 'user',
                content: promptText,
                timestamp: new Date().toISOString(),
              },
              {
                role: 'assistant',
                content: replyText,
                routedVia,
                handoffInjected,
                handoffFrom,
                timestamp: new Date().toISOString(),
                attemptTrace: attempts,
                tokensUsed,
              },
            ],
            steps: p.steps.map((s) =>
              s.id === stepId
                ? {
                    ...s,
                    status: 'completed',
                    completedByModel: routedVia,
                    handoffOccurred: handoffInjected,
                    handoffFromModel: handoffFrom,
                  }
                : s
            ),
          };
        })
      );

      if (extractedFiles.length > 0) {
        setSelectedFilePath(extractedFiles[0].path);
      }

      // If Auto-Exhaust Demo Mode is enabled, automatically mark the provider that just served this step as HTTP 429 Rate Limited
      // so the very next step demonstrates automatic failover & Context Handoff to the next AI in the chain!
      if (autoExhaustAfterTurn && routerState) {
        const servedEndpoint = routerState.endpoints.find(
          (e) => `${e.platform}/${e.modelId}` === routedVia
        );
        if (servedEndpoint) {
          await fetch(`/api/router/endpoint/${servedEndpoint.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rate_limited_429' }),
          });
        }
      }

      await fetchRouterState();
    } catch (err) {
      console.error(err);
      if (stepId) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === activeProject.id
              ? {
                  ...p,
                  steps: p.steps.map((s) => (s.id === stepId ? { ...s, status: 'pending' } : s)),
                }
              : p
          )
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRunNextPendingStep = () => {
    const nextStep = activeProject.steps.find((s) => s.status === 'pending');
    if (!nextStep) return;
    const defaultPaths: Record<number, string> = {
      1: 'src/types/billing.ts',
      2: 'src/services/splitEngine.ts',
      3: 'src/routes/checkoutController.ts',
      4: 'src/tests/billing.spec.ts',
    };
    executeProjectPrompt(
      nextStep.prompt,
      nextStep.id,
      defaultPaths[nextStep.stepNumber] || `src/step_${nextStep.stepNumber}.ts`
    );
  };

  const handleCreateNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;
    const id = `proj-${Date.now()}`;
    const newProj: ContinuityProject = {
      id,
      sessionKey: `session-${Date.now()}`,
      name: newProjectTitle.trim(),
      description: 'Projeto customizado conectado ao roteador FreeLLMAPI com Context Handoff ativo.',
      strategy: routerState?.strategy || 'auto:coding',
      contextHandoffMode: 'full_project_state',
      messages: [],
      files: [
        {
          path: 'README.md',
          language: 'markdown',
          content: `# ${newProjectTitle.trim()}\n\nProjeto iniciado com proteção anti-parada de créditos FreeLLMAPI.`,
          lastUpdatedByModel: 'freellmapi/init',
          updatedAt: new Date().toISOString(),
        },
      ],
      steps: [
        {
          id: `${id}-s1`,
          stepNumber: 1,
          title: '01. Estrutura Principal e Modelos de Domínio',
          prompt: `Crie o arquivo \`src/core/domain.ts\` com toda a modelagem de dados e regras de negócio principais para o projeto "${newProjectTitle.trim()}".`,
          status: 'pending',
        },
        {
          id: `${id}-s2`,
          stepNumber: 2,
          title: '02. Camada de Serviço e Integração API',
          prompt: `Dando continuidade ao projeto "${newProjectTitle.trim()}" a partir de \`src/core/domain.ts\`, implemente \`src/services/apiService.ts\` com tratamento de erros e lógica completa.`,
          status: 'pending',
        },
        {
          id: `${id}-s3`,
          stepNumber: 3,
          title: '03. Interface e Componentes Principais',
          prompt: `Continuando o projeto "${newProjectTitle.trim()}", crie o componente principal \`src/components/WorkspaceView.tsx\` consumindo os serviços criados nas etapas anteriores.`,
          status: 'pending',
        },
      ],
      totalTokensUsed: 0,
      totalHandoffs: 0,
      createdAt: new Date().toISOString(),
    };

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(id);
    setSelectedFilePath('README.md');
    setNewProjectTitle('');
    setShowNewProjectForm(false);
  };

  const nextPendingStep = activeProject.steps.find((s) => s.status === 'pending');
  const activePrimaryEndpoint = routerState?.endpoints.find((e) => e.status === 'active');
  const exhaustedCount =
    routerState?.endpoints.filter((e) => e.status !== 'active').length || 0;

  const filteredCatalog = (routerState?.endpoints || []).filter((ep) => {
    const matchesQuery =
      !catalogSearch.trim() ||
      ep.displayName.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      ep.providerName.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      ep.modelId.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      ep.platform.toLowerCase().includes(catalogSearch.toLowerCase());

    const matchesStatus =
      catalogStatusFilter === 'all' ||
      (catalogStatusFilter === 'active' && ep.status === 'active') ||
      (catalogStatusFilter === 'exhausted' && ep.status !== 'active');

    return matchesQuery && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-[#0F172A]/95 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('continuity');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          FreeLLMAPI
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <button
            onClick={() => setActiveSection('continuity')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'continuity'
                ? 'text-white border-b-2 border-emerald-500'
                : ''
            }`}
          >
            Continuidade
          </button>
          <button
            onClick={() => setActiveSection('failover')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'failover'
                ? 'text-white border-b-2 border-emerald-500'
                : ''
            }`}
          >
            Cadeia Failover
          </button>
          <button
            onClick={() => setActiveSection('catalog')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'catalog'
                ? 'text-white border-b-2 border-emerald-500'
                : ''
            }`}
          >
            Catálogo (635)
          </button>
          <button
            onClick={() => setActiveSection('connect')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
              activeSection === 'connect'
                ? 'text-white border-b-2 border-emerald-500'
                : ''
            }`}
          >
            Conexão /v1
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={handleResetAllQuotas}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Restaurar Cotas (34 IAs)
          </button>
        </div>
      </header>

      {/* Main Content Container (1440px baseline) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-8 space-y-8">
        {/* Global Telemetry & Fleet Capacity Bar */}
        <section className="border border-slate-800 bg-[#1E293B]/60 rounded-xl p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
            <div className="space-y-1.5 max-w-2xl">
              <div className="text-xs text-slate-400">
                Repositório Cloned: github.com/tashfeenahmed/freellmapi · Licença MIT · Context Handoff Ativo
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Roteador Multi-IA com Continuidade Automática de Projetos
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Quando uma IA atinge o limite de créditos gratuitos ou sofre rate-limit (HTTP 429), o roteador intercepta a falha em milissegundos, injeta o histórico e os arquivos do projeto via{' '}
                <code className="text-emerald-300 font-mono text-xs">FreeLLMAPI context handoff</code> e transfere a execução para o próximo provedor da fila sem interromper seu trabalho.
              </p>
            </div>

            {/* Active Route Indicator & Quick Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <div className="px-4 py-3 rounded-lg bg-[#0F172A] border border-slate-800 text-xs space-y-1">
                <div className="text-slate-400">IA Principal na Fila Agora</div>
                <div className="font-mono font-semibold text-emerald-400 text-sm">
                  {activePrimaryEndpoint
                    ? `${activePrimaryEndpoint.platform}/${activePrimaryEndpoint.modelId}`
                    : 'Auto-Recovery Standby'}
                </div>
                <div className="text-slate-400">
                  {activePrimaryEndpoint?.providerName} · {activePrimaryEndpoint?.speedTps} tok/s
                </div>
              </div>

              <button
                onClick={handleSimulateCurrentProviderExhaustion}
                className="px-4 py-3 text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-500/40 rounded-lg hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-2"
              >
                <ZapOff className="w-4 h-4 text-amber-400" />
                Simular Fim de Créditos (429) na IA Atual
              </button>
            </div>
          </div>

          {/* 4-Column Quantitative KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
            <div>
              <div className="text-xs text-slate-400">Capacidade Mensal Agregada</div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                7,40 Bilhões
              </div>
              <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                {routerState?.catalogSummary.usedMonthlyTokens.toLocaleString('pt-BR') || '49.890'} tokens usados na sessão
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Frota de Provedores Gratuitos</div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                34 Provedores · 635 Rotas
              </div>
              <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                {exhaustedCount === 0
                  ? '12 rotas prioritárias prontas (0 com cota esgotada)'
                  : `${12 - exhaustedCount} ativas · ${exhaustedCount} em cooldown HTTP 429`}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Handoffs de Continuidade Realizados</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                {routerState?.handoffHistory.length || 0} Transferências
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Zero perda de código ou contexto entre IAs
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Endpoint Unificado OpenAI (/v1)</div>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs font-mono text-slate-200 truncate max-w-[200px]">
                  {routerState?.unifiedEndpointUrl || 'http://localhost:3000/v1'}
                </code>
                <button
                  onClick={() =>
                    handleCopy(
                      routerState?.unifiedEndpointUrl || `${window.location.origin}/v1`,
                      'header-url'
                    )
                  }
                  className="p-1.5 text-slate-400 hover:text-white rounded border border-slate-700 hover:border-slate-600 transition-colors shrink-0 cursor-pointer"
                  title="Copiar URL do Endpoint /v1"
                >
                  {copiedKey === 'header-url' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Compatível com Cursor, Claude Code, Cline e SDK OpenAI
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* TAB 1: CONTINUIDADE DE PROJETOS (WORKSPACE)                         */}
        {/* =================================================================== */}
        {activeSection === 'continuity' && (
          <div className="space-y-8">
            {/* Project Workspace Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-slate-400">Projeto Ativo:</span>
                <div className="flex items-center gap-1 p-1 bg-[#1E293B] border border-slate-800 rounded-lg">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        setActiveProjectId(proj.id);
                        setSelectedFilePath(proj.files[0]?.path || 'README.md');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        proj.id === activeProject.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {proj.name}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowNewProjectForm(!showNewProjectForm)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Projeto
                </button>
              </div>

              {/* Auto-Failover Simulation Toggle */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoExhaustAfterTurn}
                    onChange={(e) => setAutoExhaustAfterTurn(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>
                    Simular esgotamento de cota (429) após cada etapa (forçar troca de IA na etapa seguinte)
                  </span>
                </label>
              </div>
            </div>

            {showNewProjectForm && (
              <form
                onSubmit={handleCreateNewProject}
                className="p-4 rounded-xl bg-[#1E293B] border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <input
                  type="text"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="Nome do novo projeto (ex: API de Logística em Tempo Real, E-Commerce Next.js...)"
                  className="flex-1 px-3.5 py-2 text-sm bg-[#0F172A] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-emerald-400 text-slate-950 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Criar Projeto com Proteção de Cota
                </button>
              </form>
            )}

            {/* Live Failover Chain Strip */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Ordem Atual da Fila de Failover (Estratégia:{' '}
                  <strong className="text-slate-200 font-mono">{routerState?.strategy}</strong> · Modo Handoff:{' '}
                  <strong className="text-slate-200 font-mono">{routerState?.contextHandoffMode}</strong>)
                </span>
                <span>Clique em qualquer provedor para alternar entre Ativo e Sem Créditos (429)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                {(routerState?.endpoints || []).slice(0, 6).map((ep, idx) => {
                  const isCurrentPrimary = activePrimaryEndpoint?.id === ep.id;
                  const isExhausted = ep.status !== 'active';
                  return (
                    <button
                      key={ep.id}
                      onClick={() =>
                        handleEndpointControl(ep.id, {
                          status: isExhausted ? 'active' : 'rate_limited_429',
                        })
                      }
                      className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        isExhausted
                          ? 'bg-red-950/20 border-red-900/50 text-slate-400'
                          : isCurrentPrimary
                          ? 'bg-emerald-950/25 border-emerald-500/60 text-white'
                          : 'bg-[#1E293B]/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">#{idx + 1} · {ep.platform}</span>
                        <span
                          className={
                            isExhausted
                              ? 'text-red-400 font-medium'
                              : isCurrentPrimary
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {isExhausted ? '429 Sem Cota' : isCurrentPrimary ? 'Ativa Agora' : 'Standby'}
                        </span>
                      </div>
                      <div className="font-semibold text-xs truncate mt-1 text-white">
                        {ep.displayName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                        {ep.usedTokens.toLocaleString('pt-BR')} tok · {ep.speedTps} t/s
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2-Column Workspace Split: Left = Project Steps & Handoff Timeline, Right = Live Code & Conversation */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column (5 cols): Project Steps & Continuity Queue */}
              <div className="lg:col-span-5 flex flex-col justify-between border border-slate-800 bg-[#1E293B]/50 rounded-xl p-6 space-y-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-white">{activeProject.name}</h2>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {activeProject.description}
                      </p>
                    </div>
                  </div>

                  {/* Primary Execution Action */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button
                      onClick={handleRunNextPendingStep}
                      disabled={isExecuting || !nextPendingStep}
                      className="flex-1 py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {isExecuting
                        ? 'Roteando e Gerando Código...'
                        : nextPendingStep
                        ? `Executar Etapa ${nextPendingStep.stepNumber} via ${
                            activePrimaryEndpoint?.displayName || 'Router'
                          }`
                        : 'Todas as Etapas Concluídas'}
                    </button>
                  </div>

                  {/* Step List */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-semibold text-slate-300">
                      Etapas do Projeto & Rastreio de Qual IA Executou
                    </div>
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-[#0F172A]">
                      {activeProject.steps.map((step) => (
                        <div key={step.id} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">
                              {step.title}
                            </span>
                            <span className="text-xs font-mono tabular-nums shrink-0">
                              {step.status === 'completed' ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Concluída
                                </span>
                              ) : step.status === 'running' ? (
                                <span className="text-amber-300">Executando...</span>
                              ) : (
                                <span className="text-slate-500">Pendente</span>
                              )}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 leading-relaxed">{step.prompt}</p>

                          {step.completedByModel && (
                            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
                              <span>
                                Assumido por: <strong className="text-emerald-300">{step.completedByModel}</strong>
                              </span>
                              {step.handoffOccurred && (
                                <span className="text-amber-300">
                                  Handoff de {step.handoffFromModel} → {step.completedByModel}
                                </span>
                              )}
                            </div>
                          )}

                          {step.status === 'pending' && (
                            <div className="pt-1">
                              <button
                                onClick={() =>
                                  executeProjectPrompt(
                                    step.prompt,
                                    step.id,
                                    `src/step_${step.stepNumber}.ts`
                                  )
                                }
                                disabled={isExecuting}
                                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 transition-colors cursor-pointer"
                              >
                                Executar esta etapa agora →
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Custom Task Continuity Input */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <label className="block text-xs font-semibold text-slate-300">
                    Continuar Projeto com Instrução Adicional
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTaskInput}
                      onChange={(e) => setCustomTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customTaskInput.trim()) {
                          executeProjectPrompt(customTaskInput, undefined, 'src/customModule.ts');
                          setCustomTaskInput('');
                        }
                      }}
                      placeholder="Peça uma nova funcionalidade ou refatoração..."
                      className="flex-1 px-3 py-2 text-xs bg-[#0F172A] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => {
                        if (!customTaskInput.trim()) return;
                        executeProjectPrompt(customTaskInput, undefined, 'src/customModule.ts');
                        setCustomTaskInput('');
                      }}
                      disabled={isExecuting || !customTaskInput.trim()}
                      className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-white disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (7 cols): Generated Project Files, Live Attempt Trace & Context Handoff Inspector */}
              <div className="lg:col-span-7 flex flex-col justify-between border border-slate-800 bg-[#1E293B]/50 rounded-xl p-6 space-y-6">
                {/* Live Attempt Trace & Context Handoff Alert */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white">
                        Arquivos do Projeto & Pacote de Context Handoff
                      </h3>
                    </div>
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      {activeProject.files.length} arquivo(s) · {activeProject.totalTokensUsed.toLocaleString('pt-BR')} tokens · {activeProject.totalHandoffs} handoff(s)
                    </div>
                  </div>

                  {/* Last Routing Attempt Trace */}
                  {lastAttemptTrace.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800 space-y-2">
                      <div className="text-xs font-semibold text-slate-300">
                        Rastreamento em Tempo Real da Última Requisição (/v1/chat/completions)
                      </div>
                      <div className="space-y-1.5">
                        {lastAttemptTrace.map((att) => (
                          <div
                            key={att.order}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Tentativa #{att.order}</span>
                              <span className="text-slate-200 font-semibold">
                                {att.platform}/{att.modelId}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={
                                  att.outcome === 'success'
                                    ? 'text-emerald-400'
                                    : 'text-amber-400'
                                }
                              >
                                {att.detail}
                              </span>
                              <span className="text-slate-500 tabular-nums">{att.latencyMs}ms</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* File Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {activeProject.files.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFilePath(file.path)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedFile?.path === file.path
                            ? 'bg-slate-900 text-emerald-300 border border-slate-700'
                            : 'bg-[#0F172A]/60 text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>{file.path}</span>
                      </button>
                    ))}
                  </div>

                  {/* Active File Viewer */}
                  {selectedFile && (
                    <div className="rounded-lg border border-slate-800 bg-[#0F172A] overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-mono text-slate-400">
                        <span>
                          Arquivo: <strong className="text-white">{selectedFile.path}</strong> · Gerado/Atualizado por:{' '}
                          <strong className="text-emerald-400">{selectedFile.lastUpdatedByModel}</strong>
                        </span>
                        <button
                          onClick={() => handleCopy(selectedFile.content, selectedFile.path)}
                          className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === selectedFile.path ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copiar Código
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[340px] leading-relaxed">
                        <code>{selectedFile.content}</code>
                      </pre>
                    </div>
                  )}
                </div>

                {/* Context Handoff Payload Inspector */}
                <div className="pt-4 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Inspeção do Pacote FreeLLMAPI Context Handoff (Injetado na Troca de IA)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      server/src/services/context-handoff.ts
                    </span>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#0F172A] border border-slate-800 text-[11px] font-mono text-emerald-300/90 overflow-x-auto max-h-[180px] leading-relaxed">
                    {activeHandoffInspector ||
                      `FreeLLMAPI context handoff:\nYou are taking over an ongoing project/conversation from another model (google/gemini-3.8-flash → groq/llama-3.3-70b-versatile).\nHandoff Trigger: HTTP 429 Too Many Requests — Free-tier quota exhausted on primary provider.\nContinue the user's project using the conversation context and workspace files already provided in this request.\nDo not restart the project from scratch, do not repeat files already completed, and maintain architectural consistency.`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: CADEIA DE FAILOVER & LIMITES DE COTA                         */}
        {/* =================================================================== */}
        {activeSection === 'failover' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Configuração da Cadeia de Failover e Limites por Provedor
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Ordene a prioridade das IAs, defina tetos de tokens para rotacionar preventivamente antes de estourar a cota gratuita ou simule erros HTTP 429.
                </p>
              </div>

              {/* Strategy Segmented Selector */}
              <div className="flex items-center gap-1 p-1 bg-[#1E293B] border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'auto:coding', label: 'auto:coding (Projetos)' },
                    { id: 'auto:smart', label: 'auto:smart (Raciocínio)' },
                    { id: 'auto:fast', label: 'auto:fast (Menor Latência)' },
                    { id: 'auto', label: 'auto (Balanceado)' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    onClick={() => handleStrategyChange(st.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      routerState?.strategy === st.id
                        ? 'bg-slate-900 text-emerald-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Handoff Mode Bar */}
            <div className="p-4 rounded-xl bg-[#1E293B]/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-white">
                  Modo de Transferência de Contexto (Context Handoff)
                </div>
                <div className="text-xs text-slate-400">
                  Define o nível de detalhe enviado automaticamente quando uma IA assume o projeto de outra IA que ficou sem créditos.
                </div>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#0F172A] border border-slate-800 rounded-lg shrink-0">
                {(
                  [
                    { id: 'full_project_state', label: 'Resumo + Arquivos do Projeto' },
                    { id: 'summary_only', label: 'Resumo da Sessão' },
                    { id: 'off', label: 'Desativado' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleHandoffModeChange(m.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      routerState?.contextHandoffMode === m.id
                        ? 'bg-[#1E293B] text-emerald-400'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* High-Density Provider Chain Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#1E293B]/40">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0F172A] text-[11px] font-semibold text-slate-400">
                      <th className="py-3 px-4">Ordem</th>
                      <th className="py-3 px-4">Provedor & Modelo (/v1)</th>
                      <th className="py-3 px-4">Estado da Cota</th>
                      <th className="py-3 px-4 text-right">Uso / Limite Mensal</th>
                      <th className="py-3 px-4 text-right">Teto p/ Rotação</th>
                      <th className="py-3 px-4 text-right">Req. / Failovers</th>
                      <th className="py-3 px-4 text-right">Ações de Roteamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-xs">
                    {(routerState?.endpoints || []).map((ep, index) => {
                      const isExhausted = ep.status !== 'active';
                      return (
                        <tr
                          key={ep.id}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <span>#{index + 1}</span>
                              <div className="flex flex-col">
                                <button
                                  onClick={() =>
                                    handleEndpointControl(ep.id, { direction: 'up' })
                                  }
                                  className="text-slate-500 hover:text-white cursor-pointer"
                                  title="Subir prioridade"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleEndpointControl(ep.id, { direction: 'down' })
                                  }
                                  className="text-slate-500 hover:text-white cursor-pointer"
                                  title="Descer prioridade"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{ep.displayName}</div>
                            <div className="text-slate-400 font-mono text-[11px]">
                              {ep.providerName} · {ep.platform}/{ep.modelId}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {ep.status === 'active' ? (
                              <span className="text-emerald-400">
                                Ativo · Pronto
                              </span>
                            ) : ep.status === 'rate_limited_429' ? (
                              <span className="text-amber-400">
                                HTTP 429 · Rate Limited
                              </span>
                            ) : (
                              <span className="text-red-400">
                                Cota Esgotada
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <div className="text-slate-200">
                              {ep.usedTokens.toLocaleString('pt-BR')} tok
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              de {(ep.monthlyFreeTokens / 1_000_000).toFixed(0)}M/mês
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {ep.tokenCapOverride ? (
                              <span className="text-amber-300">
                                {ep.tokenCapOverride.toLocaleString('pt-BR')} tok
                              </span>
                            ) : (
                              <span className="text-slate-500">Sem trava</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                            {ep.requestsServed} req · {ep.failoversTriggered} failovers
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() =>
                                  handleEndpointControl(ep.id, {
                                    tokenCapOverride: ep.tokenCapOverride
                                      ? null
                                      : ep.usedTokens + 300,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {ep.tokenCapOverride
                                  ? 'Remover Teto'
                                  : 'Travar +300 tok'}
                              </button>
                              <button
                                onClick={() =>
                                  handleEndpointControl(ep.id, {
                                    status: isExhausted ? 'active' : 'rate_limited_429',
                                  })
                                }
                                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isExhausted
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                                }`}
                              >
                                {isExhausted ? 'Reativar IA' : 'Simular 429'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: CATÁLOGO DE MODELOS GRATUITOS (34 PROVEDORES / 635 ENDPOINTS)*/}
        {/* =================================================================== */}
        {activeSection === 'catalog' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Catálogo Assinado FreeLLMAPI (474 Famílias · 635 Endpoints Gratuitos)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Pesquise métricas de inteligência, velocidade (tokens/seg), janela de contexto e limites RPM/TPM de cada provedor conectado.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Filtrar modelo ou provedor..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-[#1E293B] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#1E293B] border border-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'active', label: 'Ativos' },
                      { id: 'exhausted', label: 'Em Cooldown (429)' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setCatalogStatusFilter(f.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        catalogStatusFilter === f.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-hidden bg-[#1E293B]/40">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#0F172A] text-[11px] font-semibold text-slate-400">
                      <th className="py-3 px-4">Provedor</th>
                      <th className="py-3 px-4">Endpoint ID</th>
                      <th className="py-3 px-4 text-right">Contexto</th>
                      <th className="py-3 px-4 text-right">Limites (RPM / TPM)</th>
                      <th className="py-3 px-4 text-right">Inteligência</th>
                      <th className="py-3 px-4 text-right">Velocidade</th>
                      <th className="py-3 px-4 text-right">Confiabilidade</th>
                      <th className="py-3 px-4 text-right">Cota Mensal Gratuita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-xs">
                    {filteredCatalog.map((ep) => (
                      <tr key={ep.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-medium text-white">
                          {ep.providerName}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-300">
                          {ep.platform}/{ep.modelId}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {(ep.contextWindow / 1024).toFixed(0)}K
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {ep.rpmLimit} RPM · {(ep.tpmLimit / 1000).toFixed(0)}K TPM
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-white font-semibold">
                          {ep.intelligenceScore}/100
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                          {ep.speedTps} tok/s
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                          {ep.reliabilityPct}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                          {(ep.monthlyFreeTokens / 1_000_000).toFixed(0)}M tokens
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: CONEXÃO /v1 PARA IDEs, AGENTES E CLONE LOCAL                 */}
        {/* =================================================================== */}
        {activeSection === 'connect' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">
                Conectar Cursor, Claude Code, Cline, Aider ou Clonar no seu Ambiente
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Este servidor já expõe a rota oficial <code className="text-emerald-400 font-mono">/v1/chat/completions</code> e <code className="text-emerald-400 font-mono">/v1/models</code> compatível com qualquer cliente OpenAI.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left card: Connect External Coding Agents to THIS running gateway */}
              <div className="p-6 rounded-xl border border-slate-800 bg-[#1E293B]/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    01. Usar Este Gateway Ativo nas Suas Ferramentas (SDK OpenAI / Cursor / Cline)
                  </h3>
                  <button
                    onClick={() =>
                      handleCopy(
                        `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${
                          routerState?.unifiedEndpointUrl || `${window.location.origin}/v1`
                        }",\n    api_key="freellmapi-unified-router"\n)\n\nresp = client.chat.completions.create(\n    model="auto:coding",\n    messages=[{"role": "user", "content": "Continue implementando o módulo de pagamentos"}],\n    extra_headers={"X-Session-Key": "meu-projeto-01"}\n)\nprint(resp.choices[0].message.content)\nprint("Servido por:", resp.headers.get("x-routed-via"))`,
                        'python-snippet'
                      )
                    }
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'python-snippet' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Python
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-lg bg-[#0F172A] border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                  {`from openai import OpenAI

client = OpenAI(
    base_url="${routerState?.unifiedEndpointUrl || `${window.location.origin}/v1`}",
    api_key="freellmapi-unified-router"
)

resp = client.chat.completions.create(
    model="auto:coding",  # ou "auto", "auto:smart", "auto:fast"
    messages=[{"role": "user", "content": "Continue implementando o módulo"}],
    extra_headers={"X-Session-Key": "meu-projeto-01"}
)
print(resp.choices[0].message.content)
print("Servido pela IA:", resp.headers.get("x-routed-via"))`}
                </pre>

                <div className="text-xs text-slate-400 space-y-1">
                  <div>
                    · <strong className="text-slate-200">Base URL:</strong>{' '}
                    <code className="font-mono text-emerald-300">
                      {routerState?.unifiedEndpointUrl || `${window.location.origin}/v1`}
                    </code>
                  </div>
                  <div>
                    · <strong className="text-slate-200">Model ID recomendado:</strong>{' '}
                    <code className="font-mono text-slate-200">auto:coding</code>
                  </div>
                  <div>
                    · <strong className="text-slate-200">Cabeçalho de Resposta:</strong>{' '}
                    <code className="font-mono text-slate-200">X-Routed-Via</code> informa qual IA respondeu após eventual failover.
                  </div>
                </div>
              </div>

              {/* Right card: Official GitHub Clone & Self-Host Commands */}
              <div className="p-6 rounded-xl border border-slate-800 bg-[#1E293B]/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    02. Repositório Oficial no GitHub (tashfeenahmed/freellmapi)
                  </h3>
                  <button
                    onClick={() =>
                      handleCopy(
                        `git clone https://github.com/tashfeenahmed/freellmapi.git\ncd freellmapi\ndocker compose up -d`,
                        'git-clone'
                      )
                    }
                    className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'git-clone' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copiar Comandos
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-lg bg-[#0F172A] border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
                  {`# 1. Clonar o repositório oficial MIT para sua máquina ou servidor
git clone https://github.com/tashfeenahmed/freellmapi.git
cd freellmapi

# 2. Subir o roteador local na porta 3001 via Docker Compose
docker compose up -d

# 3. Ou configurar automaticamente seus agentes CLI (Claude Code, Cursor, Aider)
npx @freellmapi/cli setup`}
                </pre>

                <div className="text-xs text-slate-400 leading-relaxed">
                  O motor <code className="font-mono text-slate-200">context-handoff.ts</code> e a malha de roteamento por prioridade deste repositório já estão integrados e rodando diretamente neste aplicativo para que você possa iniciar e executar seus projetos aqui mesmo sem interrupção por falta de créditos.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="mt-12 border-t border-slate-800/80 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            FreeLLMAPI Router & Continuity Studio · Baseado em github.com/tashfeenahmed/freellmapi (MIT)
          </div>
          <div className="font-mono">
            Endpoint Unificado: /v1/chat/completions · Context Handoff Ativo
          </div>
        </div>
      </footer>
    </div>
  );
}
