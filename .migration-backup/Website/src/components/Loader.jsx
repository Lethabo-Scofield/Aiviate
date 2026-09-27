export function LogoSpinner({ size = 32, className = "" }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <img
          src="/logo.png"
          alt=""
          width={size}
          height={size}
          className="animate-logo-pulse"
          style={{ filter: "drop-shadow(0 0 8px rgba(17, 19, 21,0.2))" }}
        />
      </div>
    </div>
  );
}

export function Spinner({ size = 24, className = "" }) {
  return <LogoSpinner size={size} className={className} />;
}

export function LogoLoader({ size = 48, className = "" }) {
  return <LogoSpinner size={size} className={className} />;
}

export function PageLoader({ message = "Loading..." }) {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center">
        <LogoSpinner size={48} />
        <p className="text-sm text-[#868E96] mt-4 font-medium">{message}</p>
      </div>
    </div>
  );
}

export function FullScreenLoader({ message = "Loading..." }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LogoSpinner size={44} />
        <p className="text-[13px] text-[#868E96] font-medium">{message}</p>
      </div>
    </div>
  );
}

export function InlineSpinner({ size = 16 }) {
  return (
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className="animate-logo-pulse"
    />
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`apple-card p-6 ${className}`}>
      <div className="skeleton h-3 w-24 mb-4" />
      <div className="skeleton h-7 w-20 mb-3" />
      <div className="skeleton h-2.5 w-32" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="apple-card p-4 flex items-center gap-4">
      <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
      <div className="flex-1">
        <div className="skeleton h-3.5 w-40 mb-2" />
        <div className="skeleton h-2.5 w-56" />
      </div>
      <div className="skeleton h-6 w-20 rounded-full" />
    </div>
  );
}

export function SkeletonGrid({ cols = 4, rows = 1 }) {
  return (
    <div className={`grid gap-4 grid-cols-1 ${cols >= 2 ? "sm:grid-cols-2" : ""} ${cols >= 3 ? "md:grid-cols-3" : ""} ${cols >= 4 ? "lg:grid-cols-4" : ""}`}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
