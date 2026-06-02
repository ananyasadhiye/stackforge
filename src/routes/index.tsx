import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import { Download, Hammer, Loader2, Terminal, FileCode, Sparkles, Copy, Check, Share2, Clock } from "lucide-react";

import { generateProject, type GeneratedProject } from "@/lib/generate.functions";
import { FileTree } from "@/components/FileTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

// ── highlight.js loaded from CDN at runtime ──────────────────────────────────
let hljsReady = false;
let hljsLoading = false;

function loadHighlightJs(): Promise<void> {
  if (hljsReady) return Promise.resolve();
  if (hljsLoading) return new Promise((res) => { const t = setInterval(() => { if (hljsReady) { clearInterval(t); res(); } }, 50); });
  hljsLoading = true;
  return new Promise((res) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    script.onload = () => { hljsReady = true; res(); };
    document.head.appendChild(script);
  });
}

// ── language detection from extension ────────────────────────────────────────
function extToLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
    sh: "bash", env: "bash", dockerfile: "dockerfile", css: "css",
    html: "html", sql: "sql", go: "go", rs: "rust", java: "java",
    rb: "ruby", php: "php", c: "c", cpp: "cpp", toml: "toml",
  };
  if (path.toLowerCase().endsWith("dockerfile")) return "dockerfile";
  return map[ext] ?? "plaintext";
}

// ── localStorage recent projects ─────────────────────────────────────────────
const STORAGE_KEY = "stackforge_recent";
const MAX_RECENT = 3;

type RecentProject = {
  id: string;
  name: string;
  description: string;
  frontend: string;
  backend: string;
  database: string;
  auth: boolean;
  extras: string[];
  result: GeneratedProject;
  ts: number;
};

function loadRecent(): RecentProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(p: RecentProject) {
  const list = loadRecent().filter((x) => x.name !== p.name);
  list.unshift(p);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

// ── ZIP download ──────────────────────────────────────────────────────────────
async function downloadZip(name: string, result: GeneratedProject) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder(name.trim().replace(/[^a-z0-9-_]/gi, "-") || "project")!;
  for (const f of result.files) folder.file(f.path, f.content);
  folder.file("SETUP.md", `# ${name}\n\n${result.summary}\n\n## Setup\n\n${result.setup_steps.map((s) => `\`\`\`\n${s}\n\`\`\``).join("\n\n")}\n`);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${name || "project"}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── GitHub Gist export ────────────────────────────────────────────────────────
async function exportGist(name: string, result: GeneratedProject): Promise<string> {
  const files: Record<string, { content: string }> = {};
  for (const f of result.files) {
    const key = f.path.replace(/\//g, "_");
    files[key] = { content: f.content };
  }
  files["SETUP.md"] = { content: `# ${name}\n\n${result.summary}\n\n## Setup\n\n${result.setup_steps.map((s) => `\`\`\`\n${s}\n\`\`\``).join("\n\n")}\n` };
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/vnd.github+json" },
    body: JSON.stringify({ description: `StackForge – ${name}`, public: true, files }),
  });
  if (!res.ok) throw new Error("GitHub API error");
  const data = await res.json();
  return data.html_url as string;
}

// ── Route ─────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/")(
  {
    head: () => ({
      meta: [
        { title: "StackForge — AI Project Generator" },
        { name: "description", content: "Forge full-stack starter projects with AI. Pick your stack, describe your idea, get runnable code." },
      ],
    }),
    component: Index,
  }
);

const EXTRAS = [
  { id: "rest", label: "REST API" },
  { id: "docker", label: "Docker setup" },
  { id: "readme", label: "README" },
  { id: "env", label: ".env template" },
];

function Index() {
  const generate = useServerFn(generateProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frontend, setFrontend] = useState("React");
  const [backend, setBackend] = useState("Node/Express");
  const [database, setDatabase] = useState("PostgreSQL");
  const [auth, setAuth] = useState(false);
  const [extras, setExtras] = useState<string[]>(["readme", "env"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedProject | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);

  useEffect(() => { setRecent(loadRecent()); }, []);

  const toggleExtra = (id: string) =>
    setExtras((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function onGenerate() {
    if (!name.trim() || !description.trim()) { toast.error("Add a project name and description first"); return; }
    setLoading(true); setResult(null); setSelected(null);
    try {
      const data = await generate({ data: { name, description, frontend, backend, database, auth, extras } });
      setResult(data);
      setSelected(data.files[0]?.path ?? null);
      toast.success("Project forged");
      const entry: RecentProject = { id: Date.now().toString(), name, description, frontend, backend, database, auth, extras, result: data, ts: Date.now() };
      saveRecent(entry);
      setRecent(loadRecent());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  function loadFromRecent(p: RecentProject) {
    setName(p.name); setDescription(p.description);
    setFrontend(p.frontend); setBackend(p.backend); setDatabase(p.database);
    setAuth(p.auth); setExtras(p.extras);
    setResult(p.result);
    setSelected(p.result.files[0]?.path ?? null);
    toast.success(`Loaded "${p.name}"`);
  }

  const selectedFile = result?.files.find((f) => f.path === selected);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-md bg-gradient-to-br from-forge to-forge-glow text-primary-foreground shadow-lg">
              <Hammer className="size-5" />
            </div>
            <div>
              <h1 className="font-mono text-lg font-bold tracking-tight">StackForge</h1>
              <p className="text-xs text-muted-foreground">AI-powered project generator</p>
            </div>
          </div>
          <a href="https://ai.google.dev/gemini-api/docs" className="text-xs text-muted-foreground hover:text-foreground">
            powered by gemini
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[420px_1fr]">
        {/* FORM */}
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-card p-5 space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" /> Project Spec
              </h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" placeholder="my-awesome-app" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" placeholder="Describe what your app should do…" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <Label>Frontend</Label>
                <Select value={frontend} onValueChange={setFrontend}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="React">React</SelectItem>
                    <SelectItem value="Vue">Vue</SelectItem>
                    <SelectItem value="Plain HTML/CSS">Plain HTML/CSS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Backend</Label>
                <Select value={backend} onValueChange={setBackend}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Node/Express">Node / Express</SelectItem>
                    <SelectItem value="Python/Flask">Python / Flask</SelectItem>
                    <SelectItem value="Python/Django">Python / Django</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Database</Label>
                <Select value={database} onValueChange={setDatabase}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MongoDB">MongoDB</SelectItem>
                    <SelectItem value="PostgreSQL">PostgreSQL</SelectItem>
                    <SelectItem value="SQLite">SQLite</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2.5">
              <div>
                <Label htmlFor="auth" className="cursor-pointer">Authentication</Label>
                <p className="text-xs text-muted-foreground">Include auth scaffolding</p>
              </div>
              <Switch id="auth" checked={auth} onCheckedChange={setAuth} />
            </div>

            <div className="space-y-2">
              <Label>Extras</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXTRAS.map((x) => (
                  <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-sm hover:bg-accent">
                    <Checkbox checked={extras.includes(x.id)} onCheckedChange={() => toggleExtra(x.id)} />
                    {x.label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={onGenerate} disabled={loading} className="w-full bg-gradient-to-r from-forge to-forge-glow font-semibold text-primary-foreground shadow-lg hover:opacity-90" size="lg">
              {loading ? (<><Loader2 className="size-4 animate-spin" /> Forging…</>) : (<><Hammer className="size-4" /> Generate Project</>)}
            </Button>
          </section>

          {/* RECENT PROJECTS */}
          {recent.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="size-3.5 text-primary" /> Recent Projects
              </h2>
              <div className="space-y-2">
                {recent.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => loadFromRecent(p)}
                    className="w-full rounded-md border border-border bg-background/40 px-3 py-2.5 text-left transition-colors hover:bg-accent hover:border-primary/40 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-foreground group-hover:text-primary truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">{p.result.files.length} files</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground truncate">{p.description}</span>
                    </div>
                    <div className="mt-1 flex gap-1.5 flex-wrap">
                      {[p.frontend, p.backend, p.database].filter(Boolean).map((tag) => (
                        <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* OUTPUT */}
        <section className="rounded-lg border border-border bg-card overflow-hidden flex flex-col min-h-[600px]">
          {loading ? <LoadingState /> : !result ? <EmptyState /> : (
            <ResultView projectName={name} result={result} selected={selected} setSelected={setSelected} selectedFile={selectedFile} />
          )}
        </section>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-accent">
        <FileCode className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No project yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Fill out the spec on the left and hit <span className="font-mono text-primary">Generate</span> to forge a runnable starter.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-forge/30 blur-2xl animate-forge-pulse" />
        <div className="relative grid size-20 place-items-center rounded-full bg-gradient-to-br from-forge to-forge-glow text-primary-foreground shadow-2xl animate-forge-pulse">
          <Hammer className="size-9" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="font-mono text-base font-semibold">Forging your project…</h3>
        <p className="mt-1 text-sm text-muted-foreground">Hammering files into shape</p>
      </div>
      <div className="w-full max-w-md space-y-2">
        {[80, 60, 90, 70, 50].map((w, i) => (
          <div key={i} className="h-3 rounded shimmer" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

// ── Code viewer with highlight.js + copy button ───────────────────────────────
function CodeViewer({ file }: { file: { path: string; content: string } }) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    setHighlighted(false);
    loadHighlightJs().then(() => {
      if (codeRef.current && (window as any).hljs) {
        codeRef.current.removeAttribute("data-highlighted");
        codeRef.current.className = `language-${extToLang(file.path)}`;
        codeRef.current.textContent = file.content;
        (window as any).hljs.highlightElement(codeRef.current);
        setHighlighted(true);
      }
    });
  }, [file.path, file.content]);

  async function handleCopy() {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="border-b border-border bg-background/40 px-4 py-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground truncate">{file.path}</span>
        <button
          onClick={handleCopy}
          className={`ml-3 shrink-0 flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all duration-200 border ${
            copied
              ? "border-green-500/50 bg-green-500/10 text-green-400"
              : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent"
          }`}
        >
          {copied ? <><Check className="size-3" /> Copied!</> : <><Copy className="size-3" /> Copy</>}
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-background/60">
        <pre className="p-4 text-xs leading-relaxed m-0 min-h-full" style={{ background: "transparent" }}>
          <code ref={codeRef} className={`language-${extToLang(file.path)}`}>
            {file.content}
          </code>
        </pre>
      </div>
    </>
  );
}

// ── Result view ───────────────────────────────────────────────────────────────
function ResultView({
  projectName, result, selected, setSelected, selectedFile,
}: {
  projectName: string;
  result: GeneratedProject;
  selected: string | null;
  setSelected: (p: string) => void;
  selectedFile?: { path: string; content: string };
}) {
  const [zipping, setZipping] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function handleDownload() {
    try { setZipping(true); await downloadZip(projectName, result); toast.success("ZIP ready"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ZIP failed"); }
    finally { setZipping(false); }
  }

  async function handleShare() {
    try {
      setSharing(true);
      toast.info("Creating Gist…");
      const url = await exportGist(projectName, result);
      await navigator.clipboard.writeText(url);
      toast.success("Gist link copied to clipboard!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Share failed");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Tabs defaultValue="code" className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 gap-2 flex-wrap">
        <TabsList>
          <TabsTrigger value="code"><FileCode className="size-3.5" /> Code</TabsTrigger>
          <TabsTrigger value="setup"><Terminal className="size-3.5" /> Setup</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare} disabled={sharing}>
            {sharing ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />} Share Gist
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={zipping}>
            {zipping ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download ZIP
          </Button>
        </div>
      </div>

      <TabsContent value="code" className="m-0 flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-background/40">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Files ({result.files.length})
          </div>
          <FileTree files={result.files} selected={selected} onSelect={setSelected} />
        </aside>
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedFile ? (
            <CodeViewer file={selectedFile} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a file</div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="setup" className="m-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Summary</h3>
            <p className="mt-2 text-sm">{result.summary}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Run it</h3>
            <div className="mt-2 space-y-2">
              {result.setup_steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-4 py-2.5 font-mono text-sm">
                  <span className="text-primary">$</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
