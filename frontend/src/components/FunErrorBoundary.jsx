import { Component } from 'react';

const FUN_SECTION_STORAGE_KEY = 'employee-fun-open-sections';

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
    try {
      localStorage.removeItem(FUN_SECTION_STORAGE_KEY);
    } catch {
      // ignore
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-6 space-y-3">
          <p className="text-lg font-semibold text-rose-200">Fun failed to load</p>
          <p className="text-sm text-slate-300">
            Something went wrong rendering today’s games. Try resetting Fun section state, then refresh if it still fails.
          </p>
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
