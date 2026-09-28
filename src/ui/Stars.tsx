export function Stars({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`text-[#d9a441] ${className}`} role="img" aria-label={`${n} of 3 stars`}>
      {"★".repeat(n)}
      <span className="text-current opacity-25">{"★".repeat(3 - n)}</span>
    </span>
  );
}
