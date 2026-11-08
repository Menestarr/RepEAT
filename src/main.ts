import { mount } from 'svelte';
import './app.css';
import App from './ui/App.svelte';
import { errorText, notify } from './ui/toast.svelte';

window.addEventListener('unhandledrejection', (e) => notify(errorText(e.reason), 'error'));
window.addEventListener('error', (e) => notify(errorText(e.error ?? e.message), 'error'));

const target = document.getElementById('app');
if (!target) throw new Error('#app introuvable');

export default mount(App, { target });
