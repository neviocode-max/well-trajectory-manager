import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last-resort UI protection for unexpected React render/runtime failures.
 * Engineering/service errors should still be handled close to the triggering action;
 * this boundary prevents a single UI failure from leaving WTM as a blank screen.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep diagnostics in the browser console without sending company data anywhere.
    console.error('WTM unexpected UI error', error, info.componentStack);
  }

  private reload = () => window.location.reload();

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal-shell" role="alert">
        <div className="fatal-card">
          <div className="fatal-mark">!</div>
          <h1>WTM could not continue this view</h1>
          <p>No data has been uploaded anywhere. Reload the application to start a fresh browser session.</p>
          <details>
            <summary>Technical detail</summary>
            <pre>{this.state.error.message || String(this.state.error)}</pre>
          </details>
          <button className="primary" type="button" onClick={this.reload}>Reload WTM</button>
        </div>
      </div>
    );
  }
}
