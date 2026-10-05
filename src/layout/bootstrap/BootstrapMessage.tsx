import { Button } from '@douyinfe/semi-ui';

export function BootstrapMessage({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="route-loading [min-height:360px] [place-items:center] [align-content:center] [gap:16px] w-full [background:var(--semi-color-bg-0)] [color:var(--semi-color-text-1)]">
      <p role={error ? 'alert' : 'status'}>{message}</p>
      {error ? <Button onClick={() => window.location.reload()}>重新连接</Button> : null}
    </main>
  );
}
