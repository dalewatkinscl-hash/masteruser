import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import FlagIcon from './FlagIcon';

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 text-base-content/60 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function menuPosition(button, align) {
  const rect = button.getBoundingClientRect();
  const width = Math.min(288, Math.max(196, window.innerWidth - 16));
  const maxLeft = window.innerWidth - width - 8;
  const preferred = align === 'start' ? rect.left : rect.right - width;
  const left = Math.max(8, Math.min(preferred, maxLeft));
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 280 && rect.top > spaceBelow;
  return {
    position: 'fixed',
    top: openUp ? 'auto' : rect.bottom + 6,
    bottom: openUp ? window.innerHeight - rect.top + 6 : 'auto',
    left,
    width,
    zIndex: 80,
  };
}

export default function LanguageSwitcher({ compact = false, align = 'end' }) {
  const { language, languages, setLanguage, t, current } = useLanguage();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return undefined;

    const placeMenu = () => {
      const button = buttonRef.current;
      if (!button) return;
      setMenuStyle(menuPosition(button, align));
    };

    placeMenu();
    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, align]);

  const choose = (code) => {
    setLanguage(code);
    setOpen(false);
  };

  const toggle = () => {
    setOpen((value) => {
      const next = !value;
      if (next && buttonRef.current) {
        setMenuStyle(menuPosition(buttonRef.current, align));
      }
      return next;
    });
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-ghost btn-sm h-9 min-h-9 gap-2 px-2 border border-base-300 bg-base-100/80 ${compact ? '' : 'sm:px-3'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('language.label')}
        onClick={toggle}
      >
        <FlagIcon country={current.country} className="h-[14px] w-[21px]" />
        <span className={`text-sm font-medium truncate ${compact ? 'max-w-[4.5rem]' : 'max-w-[5.75rem] sm:max-w-none'}`}>
          {current.nativeName}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && menuStyle && createPortal(
        <ul
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={t('language.label')}
          style={menuStyle}
          className="list-none rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl max-h-[min(70vh,22rem)] overflow-y-auto"
        >
          <li className="list-none px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-base-content/50">
            {t('language.label')}
          </li>
          {languages.map((option) => {
            const selected = option.code === language;
            return (
              <li key={option.code} className="list-none" role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(option.code)}
                  className={`flex w-full min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-base-200 ${
                    selected ? 'bg-primary/15 font-semibold' : ''
                  }`}
                >
                  <FlagIcon country={option.country} className="h-4 w-6" />
                  <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                    <span className="text-sm text-base-content">{option.nativeName}</span>
                    <span className="text-[11px] text-base-content/60">{option.englishName}</span>
                  </span>
                  {selected ? (
                    <span className="text-primary text-xs" aria-hidden="true">✓</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
