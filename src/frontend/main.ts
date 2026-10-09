import { mountWorkbench } from './app.ts';
import './style.css';
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');
void mountWorkbench(root);
