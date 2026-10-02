export function BootstrapMessage({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="route-loading [min-height:360px] [place-items:center] [align-content:center] [gap:16px] w-full [background:var(--semi-color-bg-0)]">
      <p>{message}</p>
      {error ? (
        <button type="button" onClick={() => window.location.reload()}>
          重新连接
        </button>
      ) : null}
    </main>
  );
}
