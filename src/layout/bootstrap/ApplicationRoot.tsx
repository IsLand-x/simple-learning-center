import { BrowserRouter } from 'react-router-dom';
import { App } from '../index';

export function ApplicationRoot() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
