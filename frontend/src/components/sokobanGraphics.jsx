/** Dani Maccari Sokoban Free Tileset (16×16) — attributed in LICENSE under public/sokoban. */

const BASE = '/sokoban';

export function SokobanPixel({ src, className = '', alt = '' }) {
  return (
    <img
      src={`${BASE}/${src}`}
      alt={alt}
      draggable={false}
      className={`sokoban-pixel ${className}`}
    />
  );
}

function hashPick(r, c, variants) {
  const n = ((r * 31) + (c * 17) + 7) >>> 0;
  return variants[n % variants.length];
}

export function WallTile({ r = 0, c = 0, className = '' }) {
  const src = hashPick(r, c, ['wall.png', 'wall-b.png', 'wall-c.png']);
  return <SokobanPixel src={src} className={`w-full h-full ${className}`} alt="" />;
}

export function FloorTile({ r = 0, c = 0, className = '' }) {
  const src = hashPick(r, c, ['floor.png', 'floor-b.png']);
  return <SokobanPixel src={src} className={`w-full h-full ${className}`} alt="" />;
}

export function TargetTile({ done = false, className = '' }) {
  return (
    <SokobanPixel
      src={done ? 'target-done.png' : 'target.png'}
      className={`w-full h-full ${className}`}
      alt=""
    />
  );
}

export function CrateTile({ onTarget = false, className = '' }) {
  return (
    <SokobanPixel
      src={onTarget ? 'crate-b.png' : 'crate.png'}
      className={`sokoban-crate w-[92%] h-[92%] ${onTarget ? 'sokoban-crate--done' : ''} ${className}`}
      alt=""
    />
  );
}

/** Player with facing flip (left) and slight bob. */
export function PlayerSprite({ facing = 'down', className = '' }) {
  const flip = facing === 'left';
  return (
    <span
      className={`sokoban-player-wrap ${className}`}
      style={{ transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <SokobanPixel
        src="player.png"
        className={`sokoban-player w-full h-full ${facing === 'up' ? 'sokoban-player--up' : ''}`}
        alt=""
      />
    </span>
  );
}

export function SokobanLegend() {
  const rows = [
    { id: 'floor', title: 'Grass', effect: 'Walkable floor', icon: 'floor.png' },
    { id: 'wall', title: 'Wall', effect: 'Blocks you & crates', icon: 'wall.png' },
    { id: 'target', title: 'Button', effect: 'Park a crate here', icon: 'target.png' },
    { id: 'crate', title: 'Crate', effect: 'Push onto buttons', icon: 'crate.png' },
    { id: 'player', title: 'You', effect: 'Arrow keys / pad', icon: 'player.png' },
  ];
  return (
    <aside className="sokoban-legend" aria-label="Sokoban legend">
      <p className="sokoban-legend__heading">Legend</p>
      <ul className="sokoban-legend__list">
        {rows.map((row) => (
          <li key={row.id} className="sokoban-legend__row">
            <span className="sokoban-legend__icon">
              <SokobanPixel src={row.icon} className="w-5 h-5" alt="" />
            </span>
            <span className="sokoban-legend__text">
              <span className="sokoban-legend__title">{row.title}</span>
              <span className="sokoban-legend__effect">{row.effect}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="sokoban-legend__credit">Art · Dani Maccari Sokoban Tileset</p>
    </aside>
  );
}

function SketchCell({ tone = 'floor', children = null, className = '' }) {
  const src = {
    floor: 'floor.png',
    wall: 'wall.png',
    target: 'target.png',
    targetDone: 'target-done.png',
    water: 'water.png',
  }[tone] || 'floor.png';
  return (
    <div className={`sokoban-sketch-cell ${className}`}>
      <SokobanPixel src={src} className="w-full h-full absolute inset-0" alt="" />
      {children ? <span className="sokoban-sketch-cell__fx">{children}</span> : null}
    </div>
  );
}

function SketchBoard({ cells, cols = 3, className = '' }) {
  return (
    <div
      className={`sokoban-sketch-board ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1.75rem)` }}
    >
      {cells.map((cell, i) => (
        <SketchCell key={i} tone={cell.tone}>
          {cell.content}
        </SketchCell>
      ))}
    </div>
  );
}

/** Mini demos for the how-to carousel. */
export function SokobanTutorialSketch({ kind }) {
  if (kind === 'goal') {
    return (
      <div className="sokoban-sketch">
        <SketchBoard
          cols={3}
          cells={[
            { tone: 'wall' }, { tone: 'wall' }, { tone: 'wall' },
            { tone: 'wall' }, { tone: 'target', content: <SokobanPixel src="crate.png" className="w-5 h-5" /> }, { tone: 'wall' },
            { tone: 'wall' }, { tone: 'wall' }, { tone: 'wall' },
          ]}
        />
        <p className="sokoban-sketch-caption">Get every crate onto a button</p>
      </div>
    );
  }
  if (kind === 'move') {
    return (
      <div className="sokoban-sketch sokoban-sketch--row">
        <SketchCell tone="floor" className="sokoban-sketch-cell--lg">
          <PlayerSprite facing="right" className="w-6 h-6" />
        </SketchCell>
        <span className="sokoban-sketch-arrow" aria-hidden="true">→</span>
        <SketchCell tone="floor" className="sokoban-sketch-cell--lg">
          <PlayerSprite facing="right" className="w-6 h-6" />
        </SketchCell>
        <p className="sokoban-sketch-caption sokoban-sketch-caption--full">
          Move with arrows or the on-screen pad
        </p>
      </div>
    );
  }
  if (kind === 'push') {
    return (
      <div className="sokoban-sketch sokoban-sketch--row">
        <div className="sokoban-sketch-pair">
          <div className="flex gap-0.5">
            <SketchCell tone="floor"><PlayerSprite facing="right" className="w-5 h-5" /></SketchCell>
            <SketchCell tone="floor"><SokobanPixel src="crate.png" className="w-5 h-5" /></SketchCell>
            <SketchCell tone="floor" />
          </div>
          <p className="sokoban-sketch-caption">Walk into a crate</p>
        </div>
        <span className="sokoban-sketch-arrow" aria-hidden="true">→</span>
        <div className="sokoban-sketch-pair">
          <div className="flex gap-0.5">
            <SketchCell tone="floor" />
            <SketchCell tone="floor"><PlayerSprite facing="right" className="w-5 h-5" /></SketchCell>
            <SketchCell tone="floor"><SokobanPixel src="crate.png" className="w-5 h-5" /></SketchCell>
          </div>
          <p className="sokoban-sketch-caption">It slides one tile</p>
        </div>
      </div>
    );
  }
  if (kind === 'stuck') {
    return (
      <div className="sokoban-sketch">
        <div className="flex gap-0.5 justify-center">
          <SketchCell tone="wall" />
          <SketchCell tone="wall" />
          <SketchCell tone="floor"><SokobanPixel src="crate.png" className="w-5 h-5" /></SketchCell>
        </div>
        <div className="flex gap-0.5 justify-center">
          <SketchCell tone="wall" />
          <SketchCell tone="floor" />
          <SketchCell tone="wall" />
        </div>
        <p className="sokoban-sketch-caption sokoban-sketch-caption--warn">
          Crates don’t pull — corners can trap them
        </p>
      </div>
    );
  }
  if (kind === 'limits') {
    return (
      <div className="sokoban-sketch sokoban-sketch--row">
        <div className="sokoban-sketch-chip">Undo</div>
        <div className="sokoban-sketch-chip sokoban-sketch-chip--amber">Reset</div>
        <p className="sokoban-sketch-caption sokoban-sketch-caption--full">
          Daily play has limited undos & resets — plan ahead
        </p>
      </div>
    );
  }
  // win
  return (
    <div className="sokoban-sketch">
      <div className="sokoban-sketch-win">
        <SketchCell tone="targetDone" className="sokoban-sketch-cell--lg">
          <SokobanPixel src="crate-b.png" className="w-6 h-6 relative z-[1]" />
        </SketchCell>
        <div className="sokoban-sketch-score-chip">Solved!</div>
      </div>
      <p className="sokoban-sketch-caption">Fewer moves ranks higher on the board</p>
    </div>
  );
}
