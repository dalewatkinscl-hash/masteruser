import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const LEGACY_HOSTS = new Set([
  'master-user-management.web.app',
  'master-user-management.firebaseapp.com',
]);

const canonicalHost = 'employee.countrylion.co.uk';
const currentHost = window.location.hostname.toLowerCase();

if (LEGACY_HOSTS.has(currentHost)) {
  const target = `https://${canonicalHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
