export function ConsensusSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">Consensus</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Consensus versus adventurous"
        className="w-full accent-neon-magenta"
      />
      <span className="shrink-0 text-xs text-muted-foreground">Adventurous</span>
    </div>
  );
}
