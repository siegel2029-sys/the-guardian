import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Catches uncaught errors in the React tree below this boundary (render, lifecycles, constructors).
 * Does not catch async errors, event handlers, or errors outside React.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (this.state.hasError && error) {
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
              {error.message}
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
    return this.props.children;
  }
}
