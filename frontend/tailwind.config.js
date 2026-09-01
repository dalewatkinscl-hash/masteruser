/** @type {import('tailwindcss').Config} */
import daisyui from 'daisyui';

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cl: {
          deep: 'var(--cl-bg-deep)',
          base: 'var(--cl-bg-base)',
          elevated: 'var(--cl-bg-elevated)',
          surface: 'var(--cl-surface)',
          'surface-hover': 'var(--cl-surface-hover)',
          fg: 'var(--cl-foreground)',
          muted: 'var(--cl-foreground-muted)',
          accent: 'var(--cl-accent)',
          'accent-bright': 'var(--cl-accent-bright)',
          border: 'var(--cl-border)',
          'border-hover': 'var(--cl-border-hover)',
          input: 'var(--cl-input-bg)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Geist Sans', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        'cl-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'cl-float': 'cl-float 9s ease-in-out infinite',
        'cl-float-delayed': 'cl-float 11s ease-in-out infinite 1.5s',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'cl-float': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-20px) rotate(1deg)' },
        },
      },
      boxShadow: {
        'cl-card': 'var(--cl-shadow-card)',
        'cl-card-hover': 'var(--cl-shadow-card-hover)',
        'cl-accent': 'var(--cl-shadow-accent)',
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      'light',
      'dark',
      'corporate',
      'business',
      'nord',
      'night',
      'cupcake',
      'forest',
      'autumn',
      'aqua',
      {
        kawaii: {
          primary: '#ec4899',
          secondary: '#a78bfa',
          accent: '#38bdf8',
          neutral: '#6b2158',
          'base-100': '#ffe9f6',
          'base-200': '#ffd6ef',
          'base-300': '#f9c4e1',
          info: '#7dd3fc',
          success: '#86efac',
          warning: '#fde047',
          error: '#fb7185',
        },
        sunset: {
          primary: '#fb7185',
          secondary: '#fb923c',
          accent: '#f472b6',
          neutral: '#fff0e6',
          'base-100': '#4a1d20',
          'base-200': '#3a1619',
          'base-300': '#2a0f13',
          info: '#fda4af',
          success: '#86efac',
          warning: '#fdba74',
          error: '#f43f5e',
        },
        aurora: {
          primary: '#22d3ee',
          secondary: '#a78bfa',
          accent: '#38bdf8',
          neutral: '#e7fbff',
          'base-100': '#102435',
          'base-200': '#0b1d2b',
          'base-300': '#07131d',
          info: '#7dd3fc',
          success: '#6ee7b7',
          warning: '#fde68a',
          error: '#f87171',
        },
      },
    ],
    darkTheme: 'dark',
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
