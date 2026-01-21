"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Space_Grotesk } from "next/font/google";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Upload,
  Download,
  Wand2,
  LayoutGrid,
  Move,
  MousePointer2,
  Maximize2,
  Link as LinkIcon,
  Factory,
  Flame,
  Cable,
  Database,
  Split,
  Code2,
  Search,
  SlidersHorizontal,
} from "lucide-react";

const font = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const EXAMPLE = {
  meta: { name: "100% Copper Wire (1:1:1)", tick: "per_min" },
  items: ["copper_ore", "copper_plate", "copper_wire"],
  nodes: [
    { id: "n1", type: "miner", label: "Copper Miner", pos: { x: 110, y: 170 }, inputs: {}, outputs: { copper_ore: 60 }, tier: "base" },
    { id: "n2", type: "smelter", label: "Smelter", pos: { x: 520, y: 170 }, inputs: { copper_ore: 60 }, outputs: { copper_plate: 60 }, tier: "base" },
    { id: "n3", type: "wire", label: "Wire Machine", pos: { x: 930, y: 170 }, inputs: { copper_plate: 60 }, outputs: { copper_wire: 60 }, tier: "base" },
    { id: "n4", type: "storage", label: "Storage", pos: { x: 1340, y: 170 }, inputs: { copper_wire: 60 }, outputs: {}, tier: "base" },
  ],
  edges: [
    { id: "e1", from: { node: "n1", item: "copper_ore" }, to: { node: "n2", item: "copper_ore" }, rate: 60, label: "Belt" },
    { id: "e2", from: { node: "n2", item: "copper_plate" }, to: { node: "n3", item: "copper_plate" }, rate: 60, label: "Belt" },
    { id: "e3", from: { node: "n3", item: "copper_wire" }, to: { node: "n4", item: "copper_wire" }, rate: 60, label: "Belt" },
  ],
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function safeParseJSON(text) {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function normalizeBlueprint(bp) {
  const meta = bp?.meta || {};
  const nodes = Array.isArray(bp?.nodes) ? bp.nodes : [];
  const edges = Array.isArray(bp?.edges) ? bp.edges : [];

  let x = 110,
    y = 170,
    col = 0;

  const positioned = nodes.map((n, i) => {
    const pos = n?.pos && Number.isFinite(n.pos.x) && Number.isFinite(n.pos.y) ? n.pos : null;
    if (pos) return { ...n, pos };
    const p = { x: x + col * 410, y: y + (i % 6) * 180 };
    col = (col + 1) % 3;
    return { ...n, pos: p };
  });

  return {
    meta: { name: meta?.name || "Untitled Blueprint", tick: meta?.tick || "per_min" },
    items: Array.isArray(bp?.items) ? bp.items : [],
    nodes: positioned,
    edges,
  };
}

function sumObj(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = (out[k] || 0) + n;
  }
  return out;
}

function computeStats(bp) {
  const inFlow = new Map();
  const outFlow = new Map();

  function key(nodeId, item) {
    return `${nodeId}::${item}`;
  }

  for (const e of bp.edges) {
    const rate = Number(e?.rate);
    if (!Number.isFinite(rate)) continue;
    const from = e?.from;
    const to = e?.to;
    if (!from?.node || !to?.node || !from?.item || !to?.item) continue;

    outFlow.set(key(from.node, from.item), (outFlow.get(key(from.node, from.item)) || 0) + rate);
    inFlow.set(key(to.node, to.item), (inFlow.get(key(to.node, to.item)) || 0) + rate);
  }

  const nodeChecks = bp.nodes.map((n) => {
    const inputs = sumObj(n.inputs);
    const outputs = sumObj(n.outputs);

    const inputRows = Object.entries(inputs).map(([item, need]) => {
      const got = inFlow.get(key(n.id, item)) || 0;
      const util = need > 0 ? clamp(got / need, 0, 10) : 1;
      return { item, need, got, util };
    });

    const outputRows = Object.entries(outputs).map(([item, prod]) => {
      const sent = outFlow.get(key(n.id, item)) || 0;
      const util = prod > 0 ? clamp(sent / prod, 0, 10) : 1;
      return { item, prod, sent, util };
    });

    const starving = inputRows.some((r) => r.got + 1e-9 < r.need);
    const underRouted = outputRows.some((r) => r.sent + 1e-9 < r.prod);

    return {
      id: n.id,
      label: n.label || n.id,
      type: n.type || "custom",
      tier: n.tier || "",
      inputRows,
      outputRows,
      starving,
      underRouted,
    };
  });

  const itemProd = {};
  const itemCons = {};
  for (const n of bp.nodes) {
    for (const [item, v] of Object.entries(sumObj(n.outputs))) itemProd[item] = (itemProd[item] || 0) + v;
    for (const [item, v] of Object.entries(sumObj(n.inputs))) itemCons[item] = (itemCons[item] || 0) + v;
  }

  const allItems = new Set([...Object.keys(itemProd), ...Object.keys(itemCons), ...(bp.items || [])]);
  const itemBalance = Array.from(allItems)
    .sort()
    .map((item) => {
      const prod = itemProd[item] || 0;
      const cons = itemCons[item] || 0;
      return { item, prod, cons, net: prod - cons };
    });

  return { nodeChecks, itemBalance };
}

function statusForNodeCheck(c) {
  if (c.starving) return { text: "STARVING", variant: "destructive" };
  if (c.underRouted) return { text: "UNDER-ROUTED", variant: "secondary" };
  return { text: "OK", variant: "secondary" };
}

function iconForType(type) {
  const t = String(type || "custom").toLowerCase();
  if (t.includes("miner")) return Factory;
  if (t.includes("smelt")) return Flame;
  if (t.includes("wire") || t.includes("cable")) return Cable;
  if (t.includes("split")) return Split;
  if (t.includes("store") || t.includes("storage")) return Database;
  return LinkIcon;
}

function NodeCard({ node, selected, status, draggable, onSelect, onHandlePointerDown }) {
  const Icon = iconForType(node.type);

  const inputsText = useMemo(() => {
    const entries = Object.entries(node.inputs || {});
    if (!entries.length) return "-";
    return entries.map(([k, v]) => `${k}: ${v}`).join("\n");
  }, [node.inputs]);

  const outputsText = useMemo(() => {
    const entries = Object.entries(node.outputs || {});
    if (!entries.length) return "-";
    return entries.map(([k, v]) => `${k}: ${v}`).join("\n");
  }, [node.outputs]);

  return (
    <div
      className={
        "rounded-2xl border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50 shadow-sm w-[248px] overflow-hidden transition " +
        (selected ? "ring-2 ring-primary" : "hover:border-foreground/30")
      }
      onClick={onSelect}
    >
      <div
        className={
          "px-3 py-2 flex items-center justify-between gap-2 border-b bg-muted/40 " +
          (draggable ? "cursor-grab active:cursor-grabbing" : "")
        }
        onPointerDown={draggable ? onHandlePointerDown : undefined}
      >
        <div className="min-w-0 flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-background/70 border flex items-center justify-center">
            <Icon className="h-4 w-4 text-foreground/70" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{node.label || node.id}</div>
            <div className="text-[11px] text-muted-foreground truncate">{node.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status ? (
            <Badge variant={status.variant} className="text-[10px] rounded-xl">
              {status.text}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-[10px] rounded-xl">
            {String(node.type || "custom")}
          </Badge>
        </div>
      </div>

      <div className="px-3 py-2 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="font-medium">Inputs</div>
          <div className="text-muted-foreground whitespace-pre-wrap leading-4">{inputsText}</div>
        </div>
        <div>
          <div className="font-medium">Outputs</div>
          <div className="text-muted-foreground whitespace-pre-wrap leading-4">{outputsText}</div>
        </div>
      </div>
    </div>
  );
}

function EdgeLabel({ x, y, text }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-74} y={-13} width={148} height={26} rx={12} className="fill-background/90 stroke-foreground/10" />
      <text textAnchor="middle" dominantBaseline="middle" className="fill-foreground/70 text-[10px]">
        {text}
      </text>
    </g>
  );
}

function ArrowPath({ x1, y1, x2, y2, selected }) {
  const dx = x2 - x1;
  const c1x = x1 + dx * 0.25;
  const c2x = x1 + dx * 0.75;
  return (
    <path
      d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`}
      className={
        selected
          ? "stroke-primary stroke-[2.75] fill-none drop-shadow-sm"
          : "stroke-foreground/25 stroke-2 fill-none"
      }
      markerEnd="url(#arrow)"
    />
  );
}

export default function BlueprintPreviewSite() {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(EXAMPLE, null, 2));
  const [draftJson, setDraftJson] = useState(() => JSON.stringify(EXAMPLE, null, 2));
  const [bp, setBp] = useState(() => normalizeBlueprint(EXAMPLE));
  const [parseError, setParseError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dirtyPositions, setDirtyPositions] = useState(false);
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const gridSize = 20;

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const svgRef = useRef(null);
  const fileInputRef = useRef(null);

  const dragRef = useRef({ active: false, nodeId: null, offsetX: 0, offsetY: 0, pointerId: null });

  useEffect(() => {
    const res = safeParseJSON(jsonText);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    const normalized = normalizeBlueprint(res.data);
    setParseError("");
    setBp(normalized);
    setDirtyPositions(false);
  }, [jsonText]);

  useEffect(() => {
    if (isJsonOpen) setDraftJson(jsonText);
  }, [isJsonOpen, jsonText]);

  const stats = useMemo(() => computeStats(bp), [bp]);
  const nodeById = useMemo(() => new Map(bp.nodes.map((n) => [n.id, n])), [bp.nodes]);
  const nodeCheckById = useMemo(() => new Map(stats.nodeChecks.map((c) => [c.id, c])), [stats.nodeChecks]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bp.nodes;
    return bp.nodes.filter((n) =>
      [n.id, n.label, n.type, n.tier].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
    );
  }, [bp.nodes, search]);

  const selectedNodeCheck = useMemo(() => {
    if (!selectedNodeId) return null;
    return stats.nodeChecks.find((c) => c.id === selectedNodeId) || null;
  }, [selectedNodeId, stats.nodeChecks]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return bp.edges.find((e) => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, bp.edges]);

  function exportJSON() {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(bp.meta?.name || "blueprint").replace(/[^a-z0-9_-]+/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const t = String(reader.result || "");
      setDraftJson(t);
    };
    reader.readAsText(file);
  }

  function clientToWorld(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    return { x, y };
  }

  function snap(v) {
    if (!snapToGrid) return v;
    return Math.round(v / gridSize) * gridSize;
  }

  function onSvgPointerDown(e) {
    if (e.target?.closest?.("[data-node]") || e.target?.closest?.("[data-edge]")) return;
    if (dragRef.current.active) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }

  function onSvgPointerMove(e) {
    if (dragRef.current.active) {
      const { nodeId, offsetX, offsetY } = dragRef.current;
      const w = clientToWorld(e.clientX, e.clientY);
      const nx = snap(w.x - offsetX);
      const ny = snap(w.y - offsetY);
      setBp((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, pos: { x: nx, y: ny } } : n)),
      }));
      if (!dirtyPositions) setDirtyPositions(true);
      return;
    }

    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
  }

  function commitPositionsToJson(currentBp) {
    const parsed = safeParseJSON(jsonText);
    if (!parsed.ok) {
      setJsonText(JSON.stringify(currentBp, null, 2));
      return;
    }

    const raw = parsed.data;
    const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const posById = new Map(currentBp.nodes.map((n) => [n.id, n.pos]));

    const updatedNodes = rawNodes.map((n) => {
      const p = posById.get(n?.id);
      if (!p) return n;
      return { ...n, pos: { x: p.x, y: p.y } };
    });

    const out = { ...raw, nodes: updatedNodes };
    setJsonText(JSON.stringify(out, null, 2));
  }

  function onSvgPointerUp(e) {
    isPanningRef.current = false;

    if (!dragRef.current.active) return;

    const { nodeId, pointerId } = dragRef.current;
    dragRef.current = { active: false, nodeId: null, offsetX: 0, offsetY: 0, pointerId: null };

    try {
      svgRef.current?.releasePointerCapture?.(pointerId);
    } catch {}

    setBp((current) => {
      commitPositionsToJson(current);
      return current;
    });

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setDirtyPositions(false);
  }

  function onWheel(e) {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    const delta = -Math.sign(e.deltaY) * 0.12;
    const nextZoom = clamp(Number((zoom + delta).toFixed(2)), 0.35, 2.5);

    const nextPanX = mouseX - worldX * nextZoom;
    const nextPanY = mouseY - worldY * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function fitToGraph() {
    const svg = svgRef.current;
    if (!svg) return;
    if (!bp.nodes.length) return;

    const w = 250;
    const h = 140;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const n of bp.nodes) {
      const x = n.pos?.x ?? 0;
      const y = n.pos?.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    const rect = svg.getBoundingClientRect();
    const pad = 70;
    const availableW = Math.max(200, rect.width - pad * 2);
    const availableH = Math.max(200, rect.height - pad * 2);

    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);

    const z = clamp(Math.min(availableW / graphW, availableH / graphH), 0.35, 2.5);

    const panX = pad + (availableW - graphW * z) / 2 - minX * z;
    const panY = pad + (availableH - graphH * z) / 2 - minY * z;

    setZoom(Number(z.toFixed(2)));
    setPan({ x: panX, y: panY });
  }

  function autoLayout() {
    const nodes = bp.nodes.map((n) => ({ ...n }));
    const indeg = new Map(nodes.map((n) => [n.id, 0]));

    for (const e of bp.edges) {
      if (e?.to?.node && indeg.has(e.to.node)) indeg.set(e.to.node, (indeg.get(e.to.node) || 0) + 1);
    }

    const roots = nodes.filter((n) => (indeg.get(n.id) || 0) === 0);
    const layer = new Map(nodes.map((n) => [n.id, 0]));

    const q = [...roots.map((n) => n.id)];
    while (q.length) {
      const id = q.shift();
      const base = layer.get(id) || 0;
      for (const e of bp.edges) {
        if (e?.from?.node === id && e?.to?.node && layer.has(e.to.node)) {
          const next = Math.max(layer.get(e.to.node) || 0, base + 1);
          if (next !== layer.get(e.to.node)) {
            layer.set(e.to.node, next);
            q.push(e.to.node);
          }
        }
      }
    }

    const buckets = new Map();
    for (const n of nodes) {
      const l = layer.get(n.id) || 0;
      if (!buckets.has(l)) buckets.set(l, []);
      buckets.get(l).push(n);
    }

    const layers = Array.from(buckets.keys()).sort((a, b) => a - b);
    const x0 = 140,
      y0 = 190,
      xGap = 410,
      yGap = 190;

    for (const l of layers) {
      const arr = buckets.get(l);
      arr.sort((a, b) => String(a.type).localeCompare(String(b.type)));
      for (let i = 0; i < arr.length; i++) {
        arr[i].pos = { x: x0 + l * xGap, y: y0 + i * yGap };
      }
    }

    const updated = { ...bp, nodes };
    setJsonText(JSON.stringify(updated, null, 2));
    setTimeout(fitToGraph, 0);
  }

  function onNodeHandlePointerDown(ev, node) {
    ev.stopPropagation();

    const pointerId = ev.pointerId;
    const w = clientToWorld(ev.clientX, ev.clientY);

    const startX = node.pos?.x ?? 0;
    const startY = node.pos?.y ?? 0;

    dragRef.current = {
      active: true,
      nodeId: node.id,
      offsetX: w.x - startX,
      offsetY: w.y - startY,
      pointerId,
    };

    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);

    try {
      svgRef.current?.setPointerCapture?.(pointerId);
    } catch {}
  }

  const jsonDraftError = useMemo(() => {
    const res = safeParseJSON(draftJson);
    return res.ok ? "" : res.error;
  }, [draftJson]);

  function applyDraft() {
    const res = safeParseJSON(draftJson);
    if (!res.ok) return;
    setJsonText(JSON.stringify(res.data, null, 2));
    setIsJsonOpen(false);
  }

  const headerTitle = bp.meta?.name || "Untitled Blueprint";

  return (
    <div className={font.className + " min-h-screen w-full bg-background text-foreground"}>
      <div className="relative h-screen w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/30" />

        <div className="absolute left-4 right-4 top-4 z-20">
          <Card className="rounded-2xl shadow-sm border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
            <CardContent className="p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-lg font-semibold truncate">{headerTitle}</div>
                  <Badge variant="secondary" className="rounded-xl text-[10px]">
                    {bp.meta?.tick || "per_min"}
                  </Badge>
                  {parseError ? (
                    <Badge variant="destructive" className="rounded-xl text-[10px]">invalid json</Badge>
                  ) : null}
                  {dirtyPositions ? (
                    <Badge variant="secondary" className="rounded-xl text-[10px]">unsaved drag</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">Scroll to zoom, drag empty space to pan, drag node header to move.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search"
                    className="rounded-xl pl-9 w-[180px]"
                  />
                </div>

                <Dialog open={isJsonOpen} onOpenChange={setIsJsonOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="rounded-xl">
                      <Code2 className="h-4 w-4 mr-2" /> JSON
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl rounded-2xl">
                    <DialogHeader>
                      <DialogTitle>Blueprint JSON</DialogTitle>
                      <DialogDescription>Paste or import JSON. Apply to update the preview.</DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) importJSONFile(f);
                          e.target.value = "";
                        }}
                      />

                      <Button variant="secondary" className="rounded-xl" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4 mr-2" /> Import
                      </Button>
                      <Button variant="secondary" className="rounded-xl" onClick={exportJSON}>
                        <Download className="h-4 w-4 mr-2" /> Export
                      </Button>
                      <Button variant="secondary" className="rounded-xl" onClick={() => setDraftJson(JSON.stringify(EXAMPLE, null, 2))}>
                        <Wand2 className="h-4 w-4 mr-2" /> Example
                      </Button>
                      <Button variant="secondary" className="rounded-xl" onClick={autoLayout}>
                        Auto layout
                      </Button>
                    </div>

                    {jsonDraftError ? (
                      <Alert className="rounded-2xl" variant="destructive">
                        <AlertTitle>JSON parse error</AlertTitle>
                        <AlertDescription className="text-sm">{jsonDraftError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <Textarea
                      value={draftJson}
                      onChange={(e) => setDraftJson(e.target.value)}
                      className="min-h-[420px] font-mono text-xs rounded-2xl"
                      spellCheck={false}
                    />

                    <DialogFooter className="flex flex-row justify-between sm:justify-between">
                      <div className="text-xs text-muted-foreground">Dragging nodes updates pos back into JSON on drop.</div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" className="rounded-xl" onClick={() => setIsJsonOpen(false)}>
                          Cancel
                        </Button>
                        <Button className="rounded-xl" onClick={applyDraft} disabled={!!jsonDraftError}>
                          Apply
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button variant="secondary" className="rounded-xl" onClick={fitToGraph}>
                  <Maximize2 className="h-4 w-4 mr-2" /> Fit
                </Button>

                <Button variant="secondary" className="rounded-xl" onClick={resetView}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Reset
                </Button>

                <div className="flex items-center gap-1">
                  <Button variant="secondary" className="rounded-xl" onClick={() => setZoom((z) => clamp(Number((z + 0.1).toFixed(2)), 0.35, 2.5))}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" className="rounded-xl" onClick={() => setZoom((z) => clamp(Number((z - 0.1).toFixed(2)), 0.35, 2.5))}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </div>

                <Badge variant="secondary" className="rounded-xl">
                  {Math.round(zoom * 100)}%
                </Badge>

                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() => setIsInspectorOpen((v) => !v)}
                >
                  <SlidersHorizontal className="h-4 w-4 mr-2" /> {isInspectorOpen ? "Hide" : "Show"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="absolute inset-0 pt-[92px]">
          <div className="h-full w-full relative">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/0 to-background/25" />

            <svg
              ref={svgRef}
              className="w-full h-full"
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
              onWheel={onWheel}
            >
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" className="fill-foreground/35" />
                </marker>

                <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                  <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} className="stroke-foreground/5" fill="none" />
                </pattern>
              </defs>

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {showGrid ? <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" /> : null}

                {bp.edges.map((e) => {
                  const a = nodeById.get(e?.from?.node);
                  const b = nodeById.get(e?.to?.node);
                  if (!a || !b) return null;

                  const x1 = a.pos?.x ?? 0;
                  const y1 = a.pos?.y ?? 0;
                  const x2 = b.pos?.x ?? 0;
                  const y2 = b.pos?.y ?? 0;

                  const selected = selectedEdgeId === e.id;

                  const label = `${e.from?.item ?? "?"} ${Number(e.rate) || 0}`;
                  const midx = (x1 + x2) / 2;
                  const midy = (y1 + y2) / 2;

                  const sx = x1 + 248;
                  const sy = y1 + 36;
                  const tx = x2 - 10;
                  const ty = y2 + 36;

                  return (
                    <g
                      key={e.id}
                      data-edge
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedEdgeId(e.id);
                        setSelectedNodeId(null);
                      }}
                      className="cursor-pointer"
                    >
                      <ArrowPath x1={sx} y1={sy} x2={tx} y2={ty} selected={selected} />
                      <EdgeLabel x={midx + 95} y={midy + 14} text={label} />
                      <path
                        d={`M ${sx} ${sy} C ${sx + (tx - sx) * 0.35} ${sy}, ${sx + (tx - sx) * 0.65} ${ty}, ${tx} ${ty}`}
                        className="stroke-transparent stroke-[14] fill-none"
                      />
                    </g>
                  );
                })}

                {bp.nodes.map((n) => {
                  const selected = selectedNodeId === n.id;
                  const c = nodeCheckById.get(n.id);
                  const st = c ? statusForNodeCheck(c) : null;

                  return (
                    <foreignObject
                      key={n.id}
                      x={n.pos?.x ?? 0}
                      y={n.pos?.y ?? 0}
                      width={260}
                      height={150}
                      data-node
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedNodeId(n.id);
                        setSelectedEdgeId(null);
                      }}
                    >
                      <div xmlns="http://www.w3.org/1999/xhtml">
                        <NodeCard
                          node={n}
                          selected={selected}
                          status={st}
                          draggable={true}
                          onSelect={() => {
                            setSelectedNodeId(n.id);
                            setSelectedEdgeId(null);
                          }}
                          onHandlePointerDown={(ev) => onNodeHandlePointerDown(ev, n)}
                        />
                      </div>
                    </foreignObject>
                  );
                })}
              </g>
            </svg>

            <div className="absolute left-4 bottom-4 z-20 pointer-events-none">
              <div className="rounded-2xl border bg-background/70 backdrop-blur px-3 py-2 shadow-sm pointer-events-none">
                <div className="text-xs text-muted-foreground inline-flex items-center gap-2">
                  <MousePointer2 className="h-4 w-4" /> drag header to move nodes
                  <Separator orientation="vertical" className="h-4" />
                  <LayoutGrid className="h-4 w-4" />
                  <span>{showGrid ? "grid on" : "grid off"}</span>
                  <Separator orientation="vertical" className="h-4" />
                  <Move className="h-4 w-4" />
                  <span>{snapToGrid ? "snap on" : "snap off"}</span>
                </div>
              </div>
            </div>

            {isInspectorOpen ? (
              <div className="absolute right-4 top-[110px] bottom-4 w-[360px] z-20">
                <Card className="h-full rounded-2xl shadow-sm border bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Inspector</CardTitle>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                        <Label className="text-sm text-muted-foreground inline-flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4" /> Grid
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
                        <Label className="text-sm text-muted-foreground inline-flex items-center gap-2">
                          <Move className="h-4 w-4" /> Snap
                        </Label>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 overflow-auto h-[calc(100%-72px)]">
                    {parseError ? (
                      <Alert className="rounded-2xl" variant="destructive">
                        <AlertTitle>JSON parse error</AlertTitle>
                        <AlertDescription className="text-sm">{parseError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <Tabs defaultValue="details">
                      <TabsList className="rounded-xl w-full">
                        <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                        <TabsTrigger value="checks" className="flex-1">Checks</TabsTrigger>
                        <TabsTrigger value="nodes" className="flex-1">Nodes</TabsTrigger>
                      </TabsList>

                      <TabsContent value="details" className="space-y-3">
                        {selectedEdge ? (
                          <Card className="rounded-2xl">
                            <CardHeader>
                              <CardTitle className="text-sm">Connection</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1 text-xs text-muted-foreground">
                              <div>
                                {selectedEdge.from?.node} ({selectedEdge.from?.item}) → {selectedEdge.to?.node} ({selectedEdge.to?.item})
                              </div>
                              <div>
                                rate: {Number(selectedEdge.rate) || 0} {bp.meta?.tick || "per_min"}
                              </div>
                              {selectedEdge.label ? <div>label: {selectedEdge.label}</div> : null}
                            </CardContent>
                          </Card>
                        ) : null}

                        {selectedNodeCheck ? (
                          <Card className="rounded-2xl">
                            <CardHeader>
                              <CardTitle className="text-sm">Machine</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {selectedNodeCheck.label} ({selectedNodeCheck.type})
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {selectedNodeCheck.starving
                                  ? "Input-starved: not enough incoming flow."
                                  : selectedNodeCheck.underRouted
                                    ? "Not fully utilized: outputs not fully routed."
                                    : "Looks balanced from the JSON rates."}
                              </div>
                              <Separator />
                              <div className="text-xs text-muted-foreground">Inputs</div>
                              {selectedNodeCheck.inputRows.length ? (
                                <div className="space-y-1">
                                  {selectedNodeCheck.inputRows.map((r) => (
                                    <div key={r.item} className="flex items-center justify-between gap-2">
                                      <div className="font-mono text-xs truncate">{r.item}</div>
                                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                                        need {r.need} | got {r.got} | {(r.util * 100).toFixed(0)}%
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">-</div>
                              )}
                              <Separator />
                              <div className="text-xs text-muted-foreground">Outputs</div>
                              {selectedNodeCheck.outputRows.length ? (
                                <div className="space-y-1">
                                  {selectedNodeCheck.outputRows.map((r) => (
                                    <div key={r.item} className="flex items-center justify-between gap-2">
                                      <div className="font-mono text-xs truncate">{r.item}</div>
                                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                                        prod {r.prod} | sent {r.sent} | {(r.util * 100).toFixed(0)}%
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">-</div>
                              )}
                            </CardContent>
                          </Card>
                        ) : (
                          <div className="text-sm text-muted-foreground">Click a node or edge to inspect it.</div>
                        )}
                      </TabsContent>

                      <TabsContent value="checks" className="space-y-3">
                        <Card className="rounded-2xl">
                          <CardHeader>
                            <CardTitle className="text-sm">System Balance</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {stats.itemBalance.length === 0 ? (
                              <div className="text-sm text-muted-foreground">No items found.</div>
                            ) : (
                              <div className="space-y-2">
                                {stats.itemBalance.map((r) => (
                                  <div key={r.item} className="flex items-center justify-between gap-3">
                                    <div className="font-mono text-xs truncate">{r.item}</div>
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      prod {r.prod} | cons {r.cons} | net {r.net}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="rounded-2xl">
                          <CardHeader>
                            <CardTitle className="text-sm">Node Health</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {stats.nodeChecks.map((c) => {
                              const st = statusForNodeCheck(c);
                              return (
                                <div
                                  key={c.id}
                                  className={
                                    "rounded-xl border px-3 py-2 cursor-pointer hover:border-foreground/30 transition " +
                                    (selectedNodeId === c.id ? "ring-2 ring-primary" : "")
                                  }
                                  onClick={() => {
                                    setSelectedNodeId(c.id);
                                    setSelectedEdgeId(null);
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold truncate">{c.label}</div>
                                    <Badge variant={st.variant} className="text-[10px] rounded-xl">
                                      {st.text}
                                    </Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">{c.type}</div>
                                </div>
                              );
                            })}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="nodes" className="space-y-2">
                        <div className="relative">
                          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Filter nodes"
                            className="rounded-xl pl-9"
                          />
                        </div>
                        <div className="space-y-2">
                          {filteredNodes.map((n) => {
                            const c = nodeCheckById.get(n.id);
                            const st = c ? statusForNodeCheck(c) : null;
                            return (
                              <div
                                key={n.id}
                                className={
                                  "rounded-xl border px-3 py-2 cursor-pointer hover:border-foreground/30 transition " +
                                  (selectedNodeId === n.id ? "ring-2 ring-primary" : "")
                                }
                                onClick={() => {
                                  setSelectedNodeId(n.id);
                                  setSelectedEdgeId(null);
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold truncate">{n.label || n.id}</div>
                                  {st ? (
                                    <Badge variant={st.variant} className="text-[10px] rounded-xl">
                                      {st.text}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{n.id}</div>
                              </div>
                            );
                          })}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
