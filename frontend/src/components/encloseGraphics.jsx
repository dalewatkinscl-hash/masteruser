/** Farm RPG pixel sprites for Enclose (cow edition). */

const BASE = '/enclose';

export const ENCLOSE_ASSETS = {
  cow: `${BASE}/cow.png`,
  cowSide: `${BASE}/cow-side.png`,
  chicken: `${BASE}/chicken.png`,
  strawberry: `${BASE}/strawberry.png`,
  strawberryBig: `${BASE}/strawberry-big.png`,
  carrot: `${BASE}/carrot.png`,
  carrotGold: `${BASE}/carrot-gold.png`,
  fence: `${BASE}/fence-tile.png`,
  fenceWide: `${BASE}/fence.png`,
  portal: `${BASE}/portal.png`,
  wheat: `${BASE}/wheat.png`,
  harvest: `${BASE}/harvest-plant.png`,
  grass: `${BASE}/grass.png`,
  grassAlt: `${BASE}/grass-alt.png`,
  dirt: `${BASE}/path.png`,
  water: `${BASE}/water.png`,
  signpost: `${BASE}/signpost.png`,
};

export function PixelSprite({
  src,
  className = '',
  alt = '',
  title,
}) {
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      draggable={false}
      className={`enclose-pixel ${className}`}
    />
  );
}

export function HorseIcon({ className = 'w-5 h-5', enclosed = false }) {
  // Kept export name for call sites; renders the cow.
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.cow}
      className={`enclose-cow ${enclosed ? 'enclose-cow--enclosed' : 'enclose-cow--idle'} ${className}`}
      alt="Cow"
    />
  );
}

export function CowIcon(props) {
  return <HorseIcon {...props} />;
}

export function FenceIcon({ className = 'w-full h-full' }) {
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.fence}
      className={`enclose-fence ${className}`}
      alt="Fence"
    />
  );
}

export function CherryIcon({ className = 'w-4 h-4' }) {
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.strawberry}
      className={className}
      alt="Strawberry"
    />
  );
}

export function AppleIcon({ className = 'w-4 h-4' }) {
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.carrotGold}
      className={className}
      alt="Golden carrot"
    />
  );
}

export function BeeIcon({ className = 'w-4 h-4' }) {
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.chicken}
      className={className}
      alt="Chicken"
    />
  );
}

export function PortalIcon({ className = 'w-4 h-4', animate = true }) {
  return (
    <PixelSprite
      src={ENCLOSE_ASSETS.portal}
      className={`${animate ? 'enclose-portal' : ''} ${className}`}
      alt="Portal chest"
    />
  );
}

export function WheatStalk({ delayMs = 0, settled = false }) {
  return (
    <span
      className={`enclose-wheat ${settled ? 'enclose-wheat--settled' : ''}`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden="true"
    >
      <PixelSprite
        src={ENCLOSE_ASSETS.harvest}
        className="enclose-wheat__stalk"
        alt=""
      />
    </span>
  );
}

export function ItemIcon({ item, className = 'w-4 h-4' }) {
  if (item === 'cherry') return <CherryIcon className={className} />;
  if (item === 'apple') return <AppleIcon className={className} />;
  if (item === 'bee') return <BeeIcon className={className} />;
  return null;
}

export function itemLabel(item) {
  if (item === 'cherry') return 'Strawberry';
  if (item === 'apple') return 'Golden carrot';
  if (item === 'bee') return 'Chicken';
  return '';
}

export function itemEffect(item) {
  if (item === 'cherry') return '+3 if enclosed';
  if (item === 'apple') return '+10 if enclosed';
  if (item === 'bee') return '−5 if enclosed';
  return '';
}

/** Wooden signpost hover tip for board / legend. */
export function SignpostTip({ title, effect, tone = 'neutral' }) {
  return (
    <span className={`enclose-signpost enclose-signpost--${tone}`} role="tooltip">
      <span className="enclose-signpost__board">
        <span className="enclose-signpost__title">{title}</span>
        {effect ? <span className="enclose-signpost__effect">{effect}</span> : null}
      </span>
      <span className="enclose-signpost__post" aria-hidden="true" />
    </span>
  );
}

export const ENCLOSE_LEGEND_ITEMS = [
  {
    id: 'cow',
    title: 'Cow',
    effect: 'Trap it in a pen · tap to preview reach',
    tone: 'neutral',
    icon: (cls) => <HorseIcon className={cls} />,
  },
  {
    id: 'fence',
    title: 'Fence',
    effect: 'Blocks the cow · costs 1 wall',
    tone: 'neutral',
    icon: (cls) => <FenceIcon className={cls} />,
  },
  {
    id: 'water',
    title: 'Water',
    effect: 'Natural barrier · cannot wall',
    tone: 'neutral',
    icon: () => (
      <PixelSprite src={ENCLOSE_ASSETS.water} className="w-4 h-4" alt="Water" />
    ),
  },
  {
    id: 'grass',
    title: 'Grass',
    effect: 'Tap to place or remove a fence',
    tone: 'neutral',
    icon: () => (
      <span className="enclose-legend-swatch enclose-legend-swatch--grass" />
    ),
  },
  {
    id: 'cherry',
    title: 'Strawberry',
    effect: '+3 if enclosed',
    tone: 'good',
    icon: (cls) => <CherryIcon className={cls} />,
  },
  {
    id: 'apple',
    title: 'Golden carrot',
    effect: '+10 if enclosed',
    tone: 'great',
    icon: (cls) => <AppleIcon className={cls} />,
  },
  {
    id: 'bee',
    title: 'Chicken',
    effect: '−5 if enclosed',
    tone: 'bad',
    icon: (cls) => <BeeIcon className={cls} />,
  },
  {
    id: 'portal',
    title: 'Magic chest',
    effect: 'Teleports between its pair',
    tone: 'portal',
    icon: (cls) => <PortalIcon className={cls} animate={false} />,
  },
];

export function EncloseLegend() {
  return (
    <aside className="enclose-legend" aria-label="Enclose legend">
      <p className="enclose-legend__heading">Legend</p>
      <ul className="enclose-legend__list">
        {ENCLOSE_LEGEND_ITEMS.map((row) => (
          <li key={row.id} className="enclose-legend__row">
            <span className="enclose-legend__icon">{row.icon('w-5 h-5')}</span>
            <span className="enclose-legend__text">
              <span className="enclose-legend__title">{row.title}</span>
              <span className={`enclose-legend__effect enclose-legend__effect--${row.tone}`}>
                {row.effect}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="enclose-legend__credit">Art · Farm RPG Tiny Asset Pack</p>
    </aside>
  );
}

export function signpostForTile(tile) {
  if (tile.isHorse) {
    return { title: 'Cow', effect: 'Tap to preview reach', tone: 'neutral' };
  }
  if (tile.water) {
    return { title: 'Water', effect: 'Blocks movement', tone: 'neutral' };
  }
  if (tile.wall) {
    return { title: 'Fence', effect: 'Blocks the cow', tone: 'neutral' };
  }
  if (tile.portal) {
    return { title: 'Magic chest', effect: 'Teleports to its pair', tone: 'portal' };
  }
  if (tile.item) {
    return {
      title: itemLabel(tile.item),
      effect: itemEffect(tile.item),
      tone: tile.item === 'bee' ? 'bad' : tile.item === 'apple' ? 'great' : 'good',
    };
  }
  return null;
}

function SketchCell({
  tone = 'grass',
  border = false,
  children = null,
  className = '',
}) {
  const tones = {
    grass: border ? 'enclose-sketch-cell--border' : 'enclose-sketch-cell--grass',
    wall: 'enclose-sketch-cell--wall',
    water: 'enclose-sketch-cell--water',
    harvest: 'enclose-sketch-cell--harvest',
    reach: 'enclose-sketch-cell--reach',
  };
  return (
    <div className={`enclose-sketch-cell ${tones[tone] || tones.grass} ${className}`}>
      {children}
    </div>
  );
}

function MiniBoard({ cols, rows, cells, className = '' }) {
  return (
    <div
      className={`enclose-sketch-board ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      aria-hidden="true"
    >
      {Array.from({ length: rows * cols }).map((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cell = cells?.[`${r},${c}`] || {};
        const isBorder = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
        return (
          <SketchCell
            key={`${r}-${c}`}
            tone={cell.tone || 'grass'}
            border={!cell.tone && isBorder}
          >
            {cell.content || null}
          </SketchCell>
        );
      })}
    </div>
  );
}

/** HTML mini-boards for tutorial steps. */
export function TutorialSketch({ kind }) {
  if (kind === 'goal') {
    const fence = () => <FenceIcon className="w-[70%] h-[70%]" />;
    const cells = {
      '1,2': { tone: 'wall', content: fence() },
      '2,1': { tone: 'wall', content: fence() },
      '2,2': { tone: 'harvest', content: <HorseIcon className="w-5 h-5" enclosed /> },
      '2,3': { tone: 'wall', content: fence() },
      '3,2': { tone: 'wall', content: fence() },
    };
    return (
      <div className="enclose-sketch">
        <MiniBoard cols={5} rows={5} cells={cells} />
        <p className="enclose-sketch-caption">Closed pen · edge stays open</p>
      </div>
    );
  }

  if (kind === 'move') {
    const cells = {
      '1,2': { tone: 'reach' },
      '2,1': { tone: 'reach' },
      '2,2': { content: <HorseIcon className="w-5 h-5" /> },
      '2,3': { tone: 'reach' },
      '3,2': { tone: 'reach' },
      '0,2': { tone: 'reach' },
    };
    return (
      <div className="enclose-sketch">
        <MiniBoard cols={5} rows={5} cells={cells} />
        <p className="enclose-sketch-caption enclose-sketch-caption--warn">
          Orthogonal only · edge = escape
        </p>
      </div>
    );
  }

  if (kind === 'walls') {
    return (
      <div className="enclose-sketch enclose-sketch--row">
        <div className="enclose-sketch-pair">
          <SketchCell tone="grass" className="enclose-sketch-cell--lg">
            <span className="enclose-sketch-label">tap</span>
          </SketchCell>
          <p className="enclose-sketch-caption">Grass</p>
        </div>
        <span className="enclose-sketch-arrow" aria-hidden="true">→</span>
        <div className="enclose-sketch-pair">
          <SketchCell tone="wall" className="enclose-sketch-cell--lg">
            <FenceIcon className="w-8 h-8" />
          </SketchCell>
          <p className="enclose-sketch-caption">Fence</p>
        </div>
      </div>
    );
  }

  if (kind === 'bonus') {
    return (
      <div className="enclose-sketch enclose-sketch--row enclose-sketch--bonuses">
        <div className="enclose-sketch-pair">
          <SketchCell tone="grass" className="enclose-sketch-cell--lg">
            <CherryIcon className="w-8 h-8" />
          </SketchCell>
          <p className="enclose-sketch-caption enclose-sketch-caption--good">+3</p>
        </div>
        <div className="enclose-sketch-pair">
          <SketchCell tone="grass" className="enclose-sketch-cell--lg">
            <AppleIcon className="w-8 h-8" />
          </SketchCell>
          <p className="enclose-sketch-caption enclose-sketch-caption--great">+10</p>
        </div>
        <div className="enclose-sketch-pair">
          <SketchCell tone="grass" className="enclose-sketch-cell--lg">
            <BeeIcon className="w-8 h-8" />
          </SketchCell>
          <p className="enclose-sketch-caption enclose-sketch-caption--bad">−5</p>
        </div>
      </div>
    );
  }

  if (kind === 'portal') {
    return (
      <div className="enclose-sketch enclose-sketch--row">
        <SketchCell tone="grass" className="enclose-sketch-cell--lg">
          <PortalIcon className="w-8 h-8" animate={false} />
        </SketchCell>
        <span className="enclose-sketch-arrow enclose-sketch-arrow--portal" aria-hidden="true">
          ⇄
        </span>
        <SketchCell tone="grass" className="enclose-sketch-cell--lg">
          <PortalIcon className="w-8 h-8" animate={false} />
        </SketchCell>
        <p className="enclose-sketch-caption enclose-sketch-caption--full">
          Teleport between paired chests
        </p>
      </div>
    );
  }

  return (
    <div className="enclose-sketch">
      <div className="enclose-sketch-harvest">
        <SketchCell tone="harvest" className="enclose-sketch-cell--lg enclose-sketch-harvest-cell">
          <span className="enclose-sketch-wheat" aria-hidden="true">
            <PixelSprite src={ENCLOSE_ASSETS.harvest} className="w-6 h-6" alt="" />
          </span>
          <HorseIcon className="w-6 h-6 relative z-[1]" enclosed />
        </SketchCell>
        <div className="enclose-sketch-score-chip">Enclosed · pts</div>
      </div>
      <p className="enclose-sketch-caption">Crops grow when the pen closes</p>
    </div>
  );
}
