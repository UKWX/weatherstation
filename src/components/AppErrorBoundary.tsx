import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false
  };

  static override getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App render error:', error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
            background: 'var(--bg)',
            color: 'var(--text)'
          }}
        >
          <section
            style={{
              maxWidth: '32rem',
              padding: '1.5rem',
              borderRadius: '1.5rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-soft)'
            }}
          >
            <h1 style={{ marginTop: 0 }}>WakefieldStation hit a display error.</h1>
            <p style={{ marginBottom: 0 }}>
              Refresh the page. If the problem continues, check the API response for malformed live
              data.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
