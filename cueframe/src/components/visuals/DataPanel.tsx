/** "The edit is data" — a compact code-panel visual showing edits as
 * plain, versionable JSON rather than an opaque timeline project file. */
export function DataPanel() {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[#141019] shadow-[0_30px_80px_-20px_var(--shadow-tint)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs font-medium text-white/40">edit.json</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-[#e8d9c2]">
{`{
  "source": "raw/interview.mov",
  "framing": "auto:speaker",
  "captions": "composited",
  "formats": ["9:16", "1:1", "16:9"],
  "clips": [
    { "in": "00:00", "out": "00:05", "tag": "intro" },
    { "in": "00:05", "out": "00:27", "tag": "interview" },
    { "in": "00:27", "out": "00:43", "tag": "b-roll" }
  ]
}`}
      </pre>
      <div className="flex items-center gap-1.5 border-t border-white/10 px-5 py-3 text-[11px] text-white/40">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
        change one field, re-render — not re-edit
      </div>
    </div>
  )
}
