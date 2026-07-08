import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 未捕获的渲染错误:', error, errorInfo);
  }

  componentDidMount() {
    this.handleUnhandledRejection = (event) => {
      this.setState({ hasError: true, error: event.reason });
    };
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-primary, #0f1117)',
          color: 'var(--text-primary, #e5e7eb)',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>GlossaHub 遇到了一个错误</h2>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary, #9ca3af)', fontSize: '0.85rem' }}>
            请刷新页面重试。如果问题持续，请联系管理员。
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px',
              background: 'var(--accent, #6366f1)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
