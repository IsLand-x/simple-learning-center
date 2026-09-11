import 'allotment/dist/style.css';
import './styles.css';
import { startApplication } from './app/bootstrap/startApplication';

const rootElement = document.getElementById('root')!;
startApplication(rootElement);
