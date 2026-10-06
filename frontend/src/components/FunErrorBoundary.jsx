import { Component } from 'react';

const FUN_SECTION_STORAGE_KEYS = [
  'employee-fun-open-sections',
  'employee-fun-open-sections-v2',
];

const TOOLBOX_LOCAL_KEYS = [
  'toolbox-kick-best',
  'toolbox-kick-sfx-muted',
  'toolbox-kick-pending-score',
];

function clearFunLocalState() {
  try {
    for (const key of FUN_SECTION_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
    for (const key of TOOLBOX_LOCAL_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage access errors
  }
  try {
    sessionStorage.removeItem('toolbox-kick-pending-score');
  } catch {
    // ignore
  }
}

/**
 * Isolates Fun-tab render crashes so Profile / employee detail don’t go blank.
 */
export default class FunErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Fun tab crashed', error, info?.componentStack);
  }

  handleReset = () => {
    clearFunLocalState();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const detail = this.state.error?.message
        ? String(this.state.error.message).slice(0, 160)
        : '';
      return (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-6 space-y-3">
          <p className="text-lg font-semibold text-rose-200">Fun failed to load</p>
          <p className="text-sm text-slate-300">
            Something went wrong rendering today’s games. Try resetting Fun section state, then refresh if it still fails.
          </p>
          {detail ? (
            <p className="text-xs text-slate-500 font-mono break-all">{detail}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-rose-500/20 text-rose-100 border border-rose-500/40 hover:bg-rose-500/30"
            >
              Reset Fun sections
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-700/60 text-slate-200 border border-slate-600 hover:bg-slate-700"
            >
              Refresh page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * One game crashing must not blank the whole Fun tab.
 */
export class FunSectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Fun section crashed', this.props.label || 'section', error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const label = this.props.label || 'This game';
      return (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-rose-200">{label} failed to load</p>
          <p className="text-xs text-slate-400">
            Other games should still work. Retry this one, or collapse the section and try again later.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-rose-500/20 text-rose-100 border border-rose-500/40 hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
