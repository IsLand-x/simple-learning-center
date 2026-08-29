import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'allotment/dist/style.css';
import './styles.css';
import { App } from './App';
import { recoverMissingBookCovers } from './lib/bookCovers';
import { prepareServerState, waitForServerStateWrites } from './lib/serverStateStorage';
import { useLearningStore } from './store/useLearningStore';

const rootElement = document.getElementById('root')!;

function showBootstrapMessage(message: string, error = false) {
  const container = document.createElement('main');
  container.className = 'route-loading';
  const text = document.createElement('p');
  text.textContent = message;
  container.append(text);
  if (error) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新连接';
    retry.addEventListener('click', () => window.location.reload());
    container.append(retry);
  }
  rootElement.replaceChildren(container);
}

async function startApplication() {
  try {
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
    ReactDOM.createRoot(rootElement).render(
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

void startApplication();
