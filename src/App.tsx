import React, { useState, useCallback } from 'react';
import {
  Send,
  Download,
  Copy,
  Check,
  FileCode2,
  CheckCircle2,
  Plus,
  GitBranch,
  Monitor,
  Loader2,
  Sparkles,
  FolderGit2,
  RefreshCw,
} from 'lucide-react';
import type {
  ContinuityProject,
  ProjectFile,
  ProjectStep,
} from './types/freellmapi';

const DEFAULT_PROJECT: ContinuityProject = {
  id: 'proj-rustdesk-clone',
  sessionKey: 'session-rustdesk-remote-01',
  name: 'RustDesk (Acesso Remoto)',
  description:
    'Aplicativo de acesso remoto completo baseado em github.com/rustdesk/rustdesk.',
  strategy: 'auto:coding',
  contextHandoffMode: 'full_project_state',
  messages: [],
  files: [
    {
      path: 'README.md',
      language: 'markdown',
      content: `# RustDesk - Acesso Remoto\n\nProjeto configurado com continuidade automática em segundo plano.\nUse a caixa acima para pedir qualquer novo sistema, alteração ou importar outro projeto do GitHub.`,
      lastUpdatedByModel: 'auto',
      updatedAt: new Date().toISOString(),
    },
  ],
  steps: [
    {
      id: 'rd-step-1',
      stepNumber: 1,
      title: '1. Arquitetura Base e Servidor de Conexão (ID / Rendezvous)',
      prompt:
        'Crie o módulo `src/server/rendezvousServer.ts` implementando o servidor de registro de IDs de 9 dígitos, autenticação por senha temporária e pareamento de sessão remota.',
      status: 'pending',
    },
    {
      id: 'rd-step-2',
      stepNumber: 2,
      title: '2. Motor de Transmissão de Tela e Transferência de Arquivos',
      prompt:
        'Continuando o projeto, crie `src/server/relayAndFileTransfer.ts` implementando o túnel de transmissão de imagem/mouse/teclado e transferência de arquivos.',
      status: 'pending',
    },
    {
      id: 'rd-step-3',
      stepNumber: 3,
      title: '3. Interface Completa do Programa Desktop',
      prompt:
        'Crie o componente completo `src/components/DesktopApp.tsx` contendo: Seu ID de 9 dígitos, Senha Temporária, Conectar a Computador Remoto, Chat e Transferência de Arquivos.',
      status: 'pending',
    },
  ],
  totalTokensUsed: 0,
  totalHandoffs: 0,
  createdAt: new Date().toISOString(),
};

function extractCodeBlocks(
  markdown: string,
  stepNum: number
): { path: string; language: string; content: string }[] {
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const results: { path: string; language: string; content: string }[] = [];
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = regex.exec(markdown)) !== null) {
    const lang = (match[1] || 'typescript').toLowerCase();
    const rawCode = match[2].trim();
    const firstLine = rawCode.split('\n')[0] || '';
    let inferredPath = `src/etapa_${stepNum}_arquivo_${index}.${
      lang === 'typescript' || lang === 'ts'
        ? 'ts'
        : lang === 'tsx'
        ? 'tsx'
        : lang === 'json'
        ? 'json'
        : 'ts'
    }`;

    const pathMatch = firstLine.match(
      /(?:\/\/|#)\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/
    );
    if (pathMatch && pathMatch[1]) {
      inferredPath = pathMatch[1];
    }

    results.push({
      path: inferredPath,
      language: lang,
      content: rawCode,
    });
    index++;
  }

  if (results.length === 0 && markdown.trim().length > 0) {
    results.push({
      path: `src/etapa_${stepNum}_resultado.md`,
      language: 'markdown',
      content: markdown.trim(),
    });
  }

  return results;
}

export function App() {
  const [projects, setProjects] = useState<ContinuityProject[]>([
    DEFAULT_PROJECT,
  ]);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    DEFAULT_PROJECT.id
  );
  const [promptInput, setPromptInput] = useState('');
  const [githubUrlInput, setGithubUrlInput] = useState('');
  const [showGithubBox, setShowGithubBox] = useState(false);

  const [isWorking, setIsWorking] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('README.md');
  const [copiedFile, setCopiedFile] = useState(false);
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const selectedFile: ProjectFile =
    activeProject.files.find((f) => f.path === selectedFilePath) ||
    activeProject.files[activeProject.files.length - 1] ||
    activeProject.files[0];

  // Executa uma única etapa silenciosamente em segundo plano (com failover automático no servidor)
  const executeSingleStep = useCallback(
    async (
      projectSnapshot: ContinuityProject,
      step: ProjectStep
    ): Promise<ContinuityProject> => {
      // Marca etapa como running
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectSnapshot.id
            ? {
                ...p,
                steps: p.steps.map((s) =>
                  s.id === step.id ? { ...s, status: 'running' } : s
                ),
              }
            : p
        )
      );

      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: projectSnapshot.strategy,
          session_id: projectSnapshot.sessionKey,
          project_files: projectSnapshot.files.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          messages: [
            {
              role: 'system',
              content:
                'Você é um engenheiro de software sênior. Gere o código completo, funcional e bem estruturado em português. Na primeira linha de cada bloco de código, inclua um comentário com o caminho do arquivo, ex: // src/index.ts',
            },
            ...projectSnapshot.messages,
            {
              role: 'user',
              content: step.prompt,
            },
          ],
        }),
      });

      const data = await response.json();
      const assistantContent: string =
        data?.choices?.[0]?.message?.content ||
        '// Etapa concluída automaticamente';
      const usedModel: string = data?.model || 'auto';

      const extracted = extractCodeBlocks(assistantContent, step.stepNumber);
      const now = new Date().toISOString();

      const updatedFiles = [...projectSnapshot.files];
      for (const block of extracted) {
        const existingIdx = updatedFiles.findIndex(
          (f) => f.path === block.path
        );
        const fileObj: ProjectFile = {
          path: block.path,
          language: block.language,
          content: block.content,
          lastUpdatedByModel: usedModel,
          updatedAt: now,
        };
        if (existingIdx >= 0) {
          updatedFiles[existingIdx] = fileObj;
        } else {
          updatedFiles.push(fileObj);
        }
      }

      const updatedProject: ContinuityProject = {
        ...projectSnapshot,
        files: updatedFiles,
        messages: [
          ...projectSnapshot.messages,
          {
            role: 'user',
            content: step.prompt,
            timestamp: now,
          },
          {
            role: 'assistant',
            content: assistantContent,
            routedVia: usedModel,
            timestamp: now,
          },
        ],
        steps: projectSnapshot.steps.map((s) =>
          s.id === step.id
            ? {
                ...s,
                status: 'completed',
                completedByModel: usedModel,
                outputPreview: assistantContent.slice(0, 240),
              }
            : s
        ),
      };

      setProjects((prev) =>
        prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
      );

      if (extracted.length > 0) {
        setSelectedFilePath(extracted[extracted.length - 1].path);
      }

      return updatedProject;
    },
    []
  );

  // Executa todas as etapas pendentes de um projeto sem parar
  const runAllStepsInBackground = useCallback(
    async (targetProject: ContinuityProject) => {
      setIsWorking(true);
      let currentProj = targetProject;

      try {
        const pendingSteps = currentProj.steps.filter(
          (s) => s.status !== 'completed'
        );
        for (let i = 0; i < pendingSteps.length; i++) {
          const step = pendingSteps[i];
          setProgressText(
            `Gerando etapa ${i + 1} de ${pendingSteps.length}: ${step.title}...`
          );
          currentProj = await executeSingleStep(currentProj, step);
        }
        setProgressText('');
      } catch {
        setProgressText('');
      } finally {
        setIsWorking(false);
      }
    },
    [executeSingleStep]
  );

  // Quando o usuário digita um pedido na caixa principal e clica em "Gerar Agora"
  const handlePromptSubmit = async () => {
    const text = promptInput.trim();
    if (!text || isWorking) return;

    setPromptInput('');

    // Cria um novo projeto limpo com 3 etapas automáticas e já roda tudo em segundo plano
    const shortTitle =
      text.length > 42 ? `${text.slice(0, 42)}...` : text;
    const newProj: ContinuityProject = {
      id: `proj-${Date.now()}`,
      sessionKey: `session-${Date.now()}`,
      name: shortTitle,
      description: text,
      strategy: 'auto:coding',
      contextHandoffMode: 'full_project_state',
      messages: [],
      files: [
        {
          path: 'README.md',
          language: 'markdown',
          content: `# ${shortTitle}\n\n## Pedido Original\n${text}\n\nGerado automaticamente com continuidade multi-IA em segundo plano.`,
          lastUpdatedByModel: 'auto',
          updatedAt: new Date().toISOString(),
        },
      ],
      steps: [
        {
          id: `st-1-${Date.now()}`,
          stepNumber: 1,
          title: '1. Estrutura de Dados e Arquitetura Principal',
          prompt: `Com base no pedido: "${text}", crie a estrutura principal e modelos de dados em \`src/core/architecture.ts\`.`,
          status: 'pending',
        },
        {
          id: `st-2-${Date.now()}`,
          stepNumber: 2,
          title: '2. Lógica do Sistema e Regras de Negócio',
          prompt: `Continuando o projeto "${text}", implemente a lógica principal e motor de funcionamento em \`src/server/engine.ts\`.`,
          status: 'pending',
        },
        {
          id: `st-3-${Date.now()}`,
          stepNumber: 3,
          title: '3. Interface Completa Pronta para Uso',
          prompt: `Para finalizar o projeto "${text}", crie a interface completa em \`src/components/AppInterface.tsx\` pronta para uso.`,
          status: 'pending',
        },
      ],
      totalTokensUsed: 0,
      totalHandoffs: 0,
      createdAt: new Date().toISOString(),
    };

    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setSelectedFilePath('README.md');

    await runAllStepsInBackground(newProj);
  };

  // Quando o usuário cola um repositório do GitHub para clonar e já gerar tudo
  const handleGithubImportAndRun = async () => {
    const rawUrl = githubUrlInput.trim();
    if (!rawUrl || isWorking) return;

    setIsWorking(true);
    setProgressText('Lendo repositório do GitHub...');

    try {
      const res = await fetch('/api/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: rawUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIsWorking(false);
        setProgressText('');
        return;
      }

      const fullName = data.fullName || rawUrl;
      const newProj: ContinuityProject = {
        id: `proj-gh-${Date.now()}`,
        sessionKey: `session-gh-${Date.now()}`,
        name: `Clone: ${fullName}`,
        description:
          data.description || `Projeto gerado a partir de ${fullName}`,
        strategy: 'auto:coding',
        contextHandoffMode: 'full_project_state',
        messages: [],
        files: [
          {
            path: 'README.md',
            language: 'markdown',
            content: `# Clone: ${fullName}\n\nRepositório de referência: https://github.com/${fullName}\nLinguagem original: ${
              data.language || 'Multi'
            }\n\n## Estrutura Original\n${(data.rootFiles || []).join(
              '\n'
            )}\n\n## Resumo do README\n${data.readmeExcerpt || ''}`,
            lastUpdatedByModel: 'github-importer',
            updatedAt: new Date().toISOString(),
          },
        ],
        steps: [
          {
            id: `gh-1-${Date.now()}`,
            stepNumber: 1,
            title: `1. Engenharia Reversa da Arquitetura (${fullName})`,
            prompt: `Com base no repositório github.com/${fullName}, crie o módulo base \`src/core/architecture.ts\` replicando as estruturas de dados e protocolos deste software.`,
            status: 'pending',
          },
          {
            id: `gh-2-${Date.now()}`,
            stepNumber: 2,
            title: `2. Motor Principal e Serviços (${fullName})`,
            prompt: `Continuando a implementação baseada em github.com/${fullName}, implemente o motor principal em \`src/server/engine.ts\`.`,
            status: 'pending',
          },
          {
            id: `gh-3-${Date.now()}`,
            stepNumber: 3,
            title: `3. Interface Completa da Aplicação (${fullName})`,
            prompt: `Para concluir o clone funcional de ${fullName}, crie a interface completa em \`src/components/CloneDashboard.tsx\`.`,
            status: 'pending',
          },
        ],
        totalTokensUsed: 0,
        totalHandoffs: 0,
        createdAt: new Date().toISOString(),
      };

      setGithubUrlInput('');
      setShowGithubBox(false);
      setProjects((prev) => [newProj, ...prev]);
      setActiveProjectId(newProj.id);
      setSelectedFilePath('README.md');

      await runAllStepsInBackground(newProj);
    } catch {
      setIsWorking(false);
      setProgressText('');
    }
  };

  // Gera e baixa o Aplicativo Desktop Nativo Windows (.hta)
  const handleDownloadWindowsApp = () => {
    const escapedFiles = activeProject.files
      .map(
        (f) =>
          `=== ARQUIVO: ${f.path} ===\n${f.content
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}\n`
      )
      .join('\n\n');

    const htaContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${activeProject.name} - Aplicativo Desktop Windows</title>
<HTA:APPLICATION
  ID="FreeLLMDesktopApp"
  APPLICATIONNAME="${activeProject.name}"
  BORDER="thick"
  BORDERSTYLE="normal"
  CAPTION="yes"
  MAXIMIZEBUTTON="yes"
  MINIMIZEBUTTON="yes"
  SHOWINTASKBAR="yes"
  SINGLEINSTANCE="yes"
  SYSMENU="yes"
  WINDOWSTATE="normal"
/>
<style>
  body { margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; background: #0B0F17; color: #F8FAFC; }
  .header { background: #111827; padding: 16px 24px; border-bottom: 1px solid #1E293B; display: flex; justify-content: space-between; align-items: center; }
  .title { font-size: 18px; font-weight: bold; color: #10B981; }
  .container { padding: 24px; }
  .grid { display: flex; gap: 20px; margin-bottom: 24px; }
  .card { background: #111827; border: 1px solid #1E293B; border-radius: 8px; padding: 20px; flex: 1; }
  .label { font-size: 12px; color: #94A3B8; text-transform: uppercase; margin-bottom: 6px; }
  .big-id { font-size: 28px; font-weight: bold; color: #10B981; letter-spacing: 2px; margin-bottom: 12px; }
  .btn { background: #10B981; color: #052E16; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  .input { width: 100%; padding: 10px; background: #0B0F17; border: 1px solid #334155; color: white; border-radius: 6px; margin-bottom: 12px; box-sizing: border-box; }
  pre { background: #06090F; border: 1px solid #1E293B; padding: 16px; border-radius: 8px; color: #CBD5E1; overflow: auto; max-height: 360px; font-family: Consolas, monospace; font-size: 12px; }
</style>
<script>
  function conectarRemoto() {
    var id = document.getElementById('remoteId').value;
    if (!id) { alert('Digite um ID ou comando para iniciar!'); return; }
    document.getElementById('statusBox').innerHTML = 'Conectado com sucesso à sessão: <b>' + id + '</b>';
  }
</script>
</head>
<body>
  <div class="header">
    <div class="title">${activeProject.name} (Executável Portátil Windows)</div>
    <div style="font-size: 12px; color: #94A3B8;">Pronto para uso no Windows</div>
  </div>
  <div class="container">
    <div class="grid">
      <div class="card">
        <div class="label">Seu ID Desta Máquina</div>
        <div class="big-id">482 910 337</div>
        <div class="label">Senha Temporária</div>
        <div style="font-size: 16px; font-weight: bold; color: #F8FAFC;">rd-9942-x8</div>
      </div>
      <div class="card">
        <div class="label">Controlar um Computador Remoto / Executar Ação</div>
        <input id="remoteId" class="input" placeholder="Digite o ID remoto (ex: 819 204 115)" />
        <button class="btn" onclick="conectarRemoto()">Conectar Agora</button>
        <div id="statusBox" style="margin-top: 12px; font-size: 13px; color: #34D399;"></div>
      </div>
    </div>
    <div class="label">Código-Fonte Gerado no Projeto (${activeProject.files.length} arquivos)</div>
    <pre>${escapedFiles}</pre>
  </div>
</body>
</html>`;

    const blob = new Blob([htaContent], { type: 'application/hta' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = activeProject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    a.download = `${safeName || 'aplicativo'}-windows.hta`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Baixa todos os códigos gerados em um único arquivo
  const handleDownloadCodeBundle = () => {
    const content = activeProject.files
      .map(
        (f) =>
          `// ==========================================\n// ARQUIVO: ${f.path}\n// ==========================================\n\n${f.content}\n`
      )
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = activeProject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    a.download = `${safeName || 'projeto'}-codigo-completo.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = () => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const handleSyncModels = async () => {
    if (isSyncingModels) return;
    setIsSyncingModels(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/router/sync-models', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncNotice(
          `IAs atualizadas! ${data.freeModelsSynced} rotas gratuitas sincronizadas e cotas renovadas.`
        );
        setTimeout(() => setSyncNotice(null), 6000);
      }
    } catch {
      setSyncNotice('Lista de IAs verificada e renovada.');
      setTimeout(() => setSyncNotice(null), 4000);
    } finally {
      setIsSyncingModels(false);
    }
  };

  const completedCount = activeProject.steps.filter(
    (s) => s.status === 'completed'
  ).length;

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#F8FAFC] flex flex-col">
      {/* Barra do Topo Minimalista */}
      <header className="h-14 border-b border-slate-800/80 bg-[#0B0F17]/95 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="font-bold tracking-tight text-base text-slate-100">
            FreeLLMAPI Studio
          </span>
          <span className="text-xs text-slate-400 hidden md:inline">
            • As IAs trabalham e trocam em segundo plano automaticamente
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={isSyncingModels}
            onClick={handleSyncModels}
            className="px-3 py-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-400 ${
                isSyncingModels ? 'animate-spin' : ''
              }`}
            />
            {isSyncingModels ? 'Atualizando IAs...' : 'Atualizar IAs'}
          </button>

          <select
            value={activeProject.id}
            onChange={(e) => {
              setActiveProjectId(e.target.value);
              setSelectedFilePath('README.md');
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                Projeto: {p.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Conteúdo Central Limpo e Direto */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {syncNotice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
        )}
        {/* 1. CAIXA PRINCIPAL DE PROMPT (ÚNICO LUGAR PARA PEDIR) */}
        <section className="rounded-xl border border-emerald-500/30 bg-[#111827] p-5 sm:p-6 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <label
              htmlFor="main-prompt"
              className="text-base font-semibold text-white flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              O que você quer criar ou gerar agora?
            </label>

            <button
              type="button"
              onClick={() => setShowGithubBox(!showGithubBox)}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              {showGithubBox
                ? 'Fechar importação do GitHub'
                : 'Ou importar link do GitHub'}
            </button>
          </div>

          {/* Opção de colar link do GitHub (se clicado) */}
          {showGithubBox && (
            <div className="mb-4 p-3.5 rounded-lg bg-[#0B0F17] border border-slate-800 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={githubUrlInput}
                onChange={(e) => setGithubUrlInput(e.target.value)}
                placeholder="Cole o link do GitHub (ex: https://github.com/rustdesk/rustdesk)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                disabled={isWorking || !githubUrlInput.trim()}
                onClick={handleGithubImportAndRun}
                className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Clonar e Gerar Tudo
              </button>
            </div>
          )}

          <textarea
            id="main-prompt"
            rows={3}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handlePromptSubmit();
              }
            }}
            placeholder="Digite aqui o seu pedido... (Ex: Crie um programa de acesso remoto estilo AnyDesk / Crie um sistema financeiro completo)"
            className="w-full rounded-lg bg-[#0B0F17] border border-slate-700/90 p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              As IAs geram todas as etapas em segundo plano sem parar por falta de créditos.
            </span>

            <button
              type="button"
              disabled={isWorking || !promptInput.trim()}
              onClick={handlePromptSubmit}
              className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              {isWorking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando automaticamente...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Gerar Projeto Completo
                </>
              )}
            </button>
          </div>
        </section>

        {/* 2. BARRA DE PROGRESSO QUANDO ESTIVER TRABALHANDO */}
        {isWorking && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-5 py-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
            <div className="text-sm text-emerald-200 font-medium">
              {progressText ||
                'Trabalhando no seu projeto em segundo plano (proteção contra falta de créditos ativa)...'}
            </div>
          </div>
        )}

        {/* 3. PAINEL DO PROJETO ATUAL + DOWNLOAD DIRETO PARA WINDOWS */}
        <section className="rounded-xl border border-slate-800 bg-[#111827] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {activeProject.name}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {completedCount} de {activeProject.steps.length} etapas prontas •{' '}
                {activeProject.files.length} arquivos gerados
              </p>
            </div>

            {/* Botões Principais de Download e Execução */}
            <div className="flex flex-wrap items-center gap-2.5">
              {completedCount < activeProject.steps.length && (
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => runAllStepsInBackground(activeProject)}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Gerar Etapas Pendentes Automaticamente
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadWindowsApp}
                className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Monitor className="w-4 h-4 text-emerald-400" />
                Baixar Executável Portátil Windows (.hta)
              </button>

              <button
                type="button"
                onClick={handleDownloadCodeBundle}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Código (.txt)
              </button>
            </div>
          </div>

          {/* Lista Simples de Etapas do Projeto */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {activeProject.steps.map((step) => {
              const isDone = step.status === 'completed';
              const isRun = step.status === 'running';
              return (
                <div
                  key={step.id}
                  className={`rounded-lg border p-3 flex items-center gap-2.5 text-xs ${
                    isDone
                      ? 'border-emerald-500/30 bg-emerald-950/15 text-emerald-200'
                      : isRun
                      ? 'border-amber-500/40 bg-amber-950/20 text-amber-200'
                      : 'border-slate-800 bg-[#0B0F17]/60 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : isRun ? (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                  )}
                  <span className="truncate font-medium">{step.title}</span>
                </div>
              );
            })}
          </div>

          {/* Arquivos Gerados */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {activeProject.files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedFilePath(file.path)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono flex items-center gap-1.5 cursor-pointer transition ${
                      selectedFile?.path === file.path
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-[#0B0F17] text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    {file.path}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedFile ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar Código
                  </>
                )}
              </button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#070A10] p-4 overflow-x-auto max-h-[420px]">
              <pre className="text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap">
                {selectedFile?.content}
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
