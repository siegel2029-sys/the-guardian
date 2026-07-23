import { Component, type ErrorInfo, type ReactNode } from 'react';
import { devError } from '../../lib/safeLog';

type ErrorBoundaryVariant = 'page' | 'section';

type Props = {
  children: ReactNode;
  /** `page` = full-screen recovery; `section` = localized card (default: page). */
  variant?: ErrorBoundaryVariant;
  /** Optional custom fallback UI. Receives reset when recovery is available. */
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  /** Called after local remount reset (section / custom recovery). */
  onReset?: () => void;
  /** Optional label for PHI-safe operational logs (no patient data). */
  scopeLabel?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Catches uncaught errors in the React tree below this boundary (render, lifecycles, constructors).
 * Does not catch async errors, event handlers, or errors outside React.
 * Errors are logged via safeLog only — never raw console.error with clinical payloads.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const scope = this.props.scopeLabel ?? this.props.variant ?? 'page';
    // PHI-safe: never log error.message / stack / props (may contain clinical free text).
    devError('[ErrorBoundary]', {
      scope,
      name: error.name,
      hasComponentStack: Boolean(info.componentStack),
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private renderDefaultFallback(error: Error): ReactNode {
    const variant = this.props.variant ?? 'page';

    if (variant === 'section') {
      return (
        <div
          dir="rtl"
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-slate-800"
        >
          <p className="text-sm font-medium text-slate-900">רכיב זה אינו זמין כרגע</p>
          <p className="text-xs text-slate-600 text-center max-w-sm">
            אפשר להמשיך להשתמש בשאר המסך, או לנסות לרענן את הרכיב.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3 max-w-full overflow-auto whitespace-pre-wrap">
              {error.name}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
          >
            נסה שוב
          </button>
        </div>
      );
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 py-12 bg-slate-50 text-slate-800"
      >
        <h1 className="text-xl font-semibold text-slate-900">אירעה תקלה בטעינת האפליקציה</h1>
        <p className="text-sm text-slate-600 text-center max-w-md">
          נסו לרענן את הדף. אם הבעיה נמשכת, פנו לתמיכה טכנית.
        </p>
        {import.meta.env.DEV && (
          <pre className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-4 max-w-full overflow-auto whitespace-pre-wrap">
            {error.name}
          </pre>
        )}
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-lg bg-teal-600 text-white text-sm font-medium px-4 py-2 hover:bg-teal-700"
        >
          רענון
        </button>
      </div>
    );
  }

  render(): ReactNode {
    const { error } = this.state;
    if (this.state.hasError && error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.handleReset);
      }
      if (fallback != null) {
        return fallback;
      }
      return this.renderDefaultFallback(error);
    }
    return this.props.children;
  }
}
