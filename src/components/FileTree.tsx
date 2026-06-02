import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";

type Node = {
  name: string;
  path: string;
  children: Record<string, Node>;
  isFile: boolean;
};

function buildTree(paths: string[]): Node {
  const root: Node = { name: "", path: "", children: {}, isFile: false };
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!cur.children[part]) {
        cur.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: {},
          isFile,
        };
      }
      cur = cur.children[part];
    });
  }
  return root;
}

function NodeView({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: Node;
  depth: number;
  selected: string | null;
  onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = Object.values(node.children).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  if (node.isFile) {
    const active = selected === node.path;
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-accent ${
          active ? "bg-accent text-primary" : "text-foreground/80"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <File className="size-3.5 shrink-0 opacity-60" />
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      {node.name && (
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-accent"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <Folder className="size-3.5 text-primary/80" />
          <span className="truncate font-mono text-xs font-medium">{node.name}</span>
        </button>
      )}
      {(open || !node.name) &&
        children.map((c) => (
          <NodeView key={c.path} node={c} depth={node.name ? depth + 1 : depth} selected={selected} onSelect={onSelect} />
        ))}
    </div>
  );
}

export function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: { path: string }[];
  selected: string | null;
  onSelect: (p: string) => void;
}) {
  const tree = useMemo(() => buildTree(files.map((f) => f.path)), [files]);
  return (
    <div className="py-2">
      <NodeView node={tree} depth={0} selected={selected} onSelect={onSelect} />
    </div>
  );
}
