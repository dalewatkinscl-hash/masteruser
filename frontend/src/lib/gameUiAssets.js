/**
 * Kenney UI Pack (CC0) — shared chrome for Coach Depot + Little Dick's Toolbox.
 * Assets live in /public/game-ui (Default PNG colour sets, fonts, click SFX).
 */

export const GUI_BASE = '/game-ui';

const COLOURS = ['Blue', 'Green', 'Red', 'Yellow', 'Grey'];

export function guiPng(colour, file) {
  const c = COLOURS.includes(colour) ? colour : 'Blue';
  return `${GUI_BASE}/PNG/${c}/Default/${file}`;
}

export function guiExtra(file) {
  return `${GUI_BASE}/PNG/Extra/Default/${file}`;
}

export const GUI = {
  font: {
    future: `${GUI_BASE}/Font/Kenney Future.ttf`,
    futureNarrow: `${GUI_BASE}/Font/Kenney Future Narrow.ttf`,
  },
  sound: {
    clickA: `${GUI_BASE}/Sounds/click-a.ogg`,
    clickB: `${GUI_BASE}/Sounds/click-b.ogg`,
    switchA: `${GUI_BASE}/Sounds/switch-a.ogg`,
    switchB: `${GUI_BASE}/Sounds/switch-b.ogg`,
    tapA: `${GUI_BASE}/Sounds/tap-a.ogg`,
    tapB: `${GUI_BASE}/Sounds/tap-b.ogg`,
  },
  button: {
    rectDepth: (c = 'Blue') => guiPng(c, 'button_rectangle_depth_gradient.png'),
    rectFlat: (c = 'Blue') => guiPng(c, 'button_rectangle_gradient.png'),
    rectLine: (c = 'Blue') => guiPng(c, 'button_rectangle_line.png'),
    rectDepthFlat: (c = 'Blue') => guiPng(c, 'button_rectangle_depth_flat.png'),
    squareDepth: (c = 'Blue') => guiPng(c, 'button_square_depth_gradient.png'),
    squareFlat: (c = 'Blue') => guiPng(c, 'button_square_gradient.png'),
    roundDepth: (c = 'Blue') => guiPng(c, 'button_round_depth_gradient.png'),
    roundFlat: (c = 'Blue') => guiPng(c, 'button_round_gradient.png'),
  },
  icon: {
    check: (c = 'Blue') => guiPng(c, 'icon_checkmark.png'),
    cross: (c = 'Blue') => guiPng(c, 'icon_cross.png'),
    star: (c = 'Yellow') => guiPng(c, 'star.png'),
    starOutline: (c = 'Yellow') => guiPng(c, 'star_outline.png'),
    play: () => guiExtra('icon_play_light.png'),
    repeat: () => guiExtra('icon_repeat_light.png'),
    arrowUp: () => guiExtra('icon_arrow_up_light.png'),
    arrowDown: () => guiExtra('icon_arrow_down_light.png'),
  },
  panel: {
    input: () => guiExtra('input_rectangle.png'),
    inputOutline: () => guiExtra('input_outline_rectangle.png'),
    divider: () => guiExtra('divider.png'),
    slideTrack: (c = 'Blue') => guiPng(c, 'slide_horizontal_grey.png'),
    slideFill: (c = 'Blue') => guiPng(c, 'slide_horizontal_color.png'),
    slideHandle: (c = 'Blue') => guiPng(c, 'slide_hangle.png'),
  },
};

/** Map semantic variants → Kenney colour folder. */
export const GUI_VARIANT_COLOUR = {
  primary: 'Blue',
  success: 'Green',
  danger: 'Red',
  accent: 'Yellow',
  neutral: 'Grey',
  warning: 'Yellow',
};
