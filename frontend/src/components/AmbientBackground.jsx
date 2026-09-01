import { useTheme } from '../context/ThemeContext';

/**
 * Ambient layered background for Linear-style portal shells.
 * Respects prefers-reduced-motion and theme.
 */
export default function AmbientBackground({ className = '' }) {
  const { isLight, isKawaii } = useTheme();

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'var(--cl-ambient-base)' }}
      />

      {!isKawaii && (
        <div
          className="absolute inset-0"
          style={{
            opacity: isLight ? 0.035 : 0.02,
            backgroundImage:
              'linear-gradient(var(--cl-ambient-grid) 1px, transparent 1px), linear-gradient(90deg, var(--cl-ambient-grid) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      )}

      {!isKawaii && (
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{
            opacity: isLight ? 0.03 : 0.015,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      )}

      {isKawaii ? (
        <>
          <div className="absolute -top-32 left-[10%] h-[520px] w-[520px] rounded-full bg-[#ff9ad5]/55 blur-[80px] motion-safe:animate-cl-float" />
          <div className="absolute top-[15%] right-[-80px] h-[480px] w-[480px] rounded-full bg-[#c4b5fd]/55 blur-[90px] motion-safe:animate-cl-float-delayed" />
          <div className="absolute bottom-[-60px] left-[25%] h-[420px] w-[520px] rounded-full bg-[#7dd3fc]/45 blur-[90px] motion-safe:animate-cl-float" />
          <div className="absolute top-[40%] left-[-60px] h-[360px] w-[360px] rounded-full bg-[#fde68a]/45 blur-[80px] motion-safe:animate-cl-float-delayed" />
          <div className="absolute bottom-[10%] right-[15%] h-[300px] w-[300px] rounded-full bg-[#86efac]/40 blur-[70px] motion-safe:animate-cl-float" />
          <div className="absolute top-[60%] left-[50%] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-[#f0abfc]/35 blur-[70px] motion-safe:animate-cl-float-delayed" />
        </>
      ) : (
        <>
          <div
            className={`absolute -top-40 left-1/2 h-[900px] w-[1400px] -translate-x-1/2 rounded-full blur-[150px] motion-safe:animate-cl-float ${
              isLight ? 'bg-[#5E6AD2]/12' : 'bg-[#5E6AD2]/25'
            }`}
          />
          <div
            className={`absolute top-1/3 -left-40 h-[800px] w-[600px] rounded-full blur-[120px] motion-safe:animate-cl-float-delayed ${
              isLight ? 'bg-[#7C4DFF]/08' : 'bg-[#7C4DFF]/15'
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 h-[700px] w-[500px] rounded-full blur-[100px] motion-safe:animate-cl-float ${
              isLight ? 'bg-[#5E6AD2]/08' : 'bg-[#5E6AD2]/12'
            }`}
          />
        </>
      )}
    </div>
  );
}
