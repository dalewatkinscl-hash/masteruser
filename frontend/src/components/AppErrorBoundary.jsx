import { Component } from 'react';

/**
 * Error boundary for route/section content.
 * Prefer section variant inside Dashboard so the shell (nav) stays visible.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Employee Portal crashed', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Allow parent remounts / location keys to clear a recovered boundary.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
    }
  };

  handleHome = () => {
    this.setState({ error: null });
    if (typeof this.props.onHome === 'function') {
      this.props.onHome();
      return;
    }
    window.location.assign('/dashboard/profile');
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const section = this.props.variant === 'section';

    return (
      <div
        className={
          section
            ? 'px-4 sm:px-8 py-10'
            : 'min-h-screen flex items-center justify-center bg-base-100 px-4'
        }
      >
        <div className="w-full max-w-md rounded-xl border border-error/30 bg-error/10 p-6 space-y-4">
          <h1 className={`font-semibold text-error ${section ? 'text-lg' : 'text-xl'}`}>
            Something went wrong
          </h1>
          <p className="text-sm text-base-content/70">
            {section
              ? 'This section failed to load. You can try again without leaving the portal, or go back to your profile.'
              : 'The page failed to load. You can try again, or go back to your profile. If this keeps happening, contact IT.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={this.handleRetry}>
              Try again
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={this.handleHome}>
              Go to profile
            </button>
          </div>
        </div>
      </div>
    );
  }
}
