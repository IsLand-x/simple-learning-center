import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'allotment/dist/style.css';
import './styles.css';
import { App } from './App';
import { getAuthSession } from './lib/auth';
import { recoverMissingBookCovers } from './lib/bookCovers';
import { AUTHENTICATION_REQUIRED_EVENT } from './lib/serverApi';
import { prepareServerState, waitForServerStateWrites } from './lib/serverStateStorage';
import { LoginPage } from './pages/LoginPage';
import { useLearningStore } from './store/useLearningStore';

const rootElement = document.getElementById('root')!;
const root = ReactDOM.createRoot(rootElement);

function showBootstrapMessage(message: string, error = false) {
  root.render(
    <main className="route-loading">
      <p>{message}</p>
      {error ? <button type="button" onClick={() => window.location.reload()}>重新连接</button> : null}
    </main>,
  );
}

async function startApplication() {
  try {
    const session = await getAuthSession();
    if (!session.authenticated) {
      root.render(
        <React.StrictMode>
          <LoginPage onAuthenticated={() => window.location.reload()} />
        </React.StrictMode>,
      );
      return;
    }
    await prepareServerState((message) => showBootstrapMessage(message));
    await useLearningStore.persist.rehydrate();
    const recoveredCovers = await recoverMissingBookCovers(
      useLearningStore.getState().books,
      (current, total) => showBootstrapMessage(`正在恢复书籍封面（${current}/${total}）…`),
    );
    if (Object.keys(recoveredCovers).length) {
      useLearningStore.getState().setBookCovers(recoveredCovers);
      await waitForServerStateWrites();
    }
    useLearningStore.setState({});
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error('学习中心启动失败', error);
    const message = error instanceof Error ? error.message : '学习中心启动失败';
    showBootstrapMessage(message, true);
  }
}

window.addEventListener(AUTHENTICATION_REQUIRED_EVENT, () => {
  root.render(
    <React.StrictMode>
      <LoginPage onAuthenticated={() => window.location.reload()} />
    </React.StrictMode>,
  );
});

void startApplication();
