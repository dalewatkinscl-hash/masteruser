import { useCallback, useRef } from 'react';
import { GUI } from '../../lib/gameUiAssets';

const BUFFERS = {};

function load(name, src) {
  if (BUFFERS[name]) return BUFFERS[name];
  try {
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = 0.35;
    BUFFERS[name] = a;
    return a;
  } catch {
    return null;
  }
}

/**
 * Lightweight Kenney UI click SFX.
 * @param {{ muted?: boolean }} opts
 */
export default function useGameUiSound({ muted = false } = {}) {
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const play = useCallback((kind = 'click') => {
    if (mutedRef.current) return;
    const map = {
      click: ['clickA', GUI.sound.clickA],
      clickAlt: ['clickB', GUI.sound.clickB],
      switch: ['switchA', GUI.sound.switchA],
      tap: ['tapA', GUI.sound.tapA],
    };
    const entry = map[kind] || map.click;
    const src = load(entry[0], entry[1]);
    if (!src) return;
    try {
      const node = src.cloneNode();
      node.volume = 0.32;
      node.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  return { play };
}
