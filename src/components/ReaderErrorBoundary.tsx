import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Empty } from '@douyinfe/semi-ui';

interface ReaderErrorBoundaryProps {
  children: ReactNode;
}

interface ReaderErrorBoundaryState {
  hasError: boolean;
}

export class ReaderErrorBoundary extends Component<ReaderErrorBoundaryProps, ReaderErrorBoundaryState> {
  state: ReaderErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ReaderErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Reader page failed to render', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="reader-error-fallback">
        <Empty
          title="这本书暂时无法打开"
          description="阅读器遇到了异常，但服务器数据仍然安全。你可以返回书架后重试。"
        />
        <div className="reader-error-fallback__actions">
          <Button theme="light" onClick={() => this.setState({ hasError: false })}>重新尝试</Button>
          <Button theme="solid" type="primary" onClick={() => window.location.assign('/')}>返回书架</Button>
        </div>
      </main>
    );
  }
}
