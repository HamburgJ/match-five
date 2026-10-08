import React from 'react';
import ReactDOM from 'react-dom/client';
// 0.4 KB of body defaults; both modes override it.
import './index.css';

// Two apps share this entry and nothing else. The mode is chosen at boot from
// the path and each side is lazy-loaded, so /match-five/daily/ never loads the
// campaign's Redux store, redux-persist, react-bootstrap, HashRouter or
// gameData.json, and the classic levels never load the daily.
const isDaily = /^\/match-five\/daily(\/|$)/.test(window.location.pathname);
const container = document.getElementById('root') as HTMLElement;

if (isDaily) {
  // The daily starts GA only on burgerfun.ca and never under automation, so
  // local, preview and test runs stay out of the property.
  // GA (react-ga4) is fetched only there, off the board's critical path.
  if (window.location.hostname === 'burgerfun.ca' && !navigator.webdriver)
    import(/* webpackChunkName: "ga" */ './utils/analytics').then(({ initGA }) => initGA());
  import(/* webpackChunkName: "daily" */ './daily/boot').then(({ bootDaily }) => bootDaily(container));
} else {
  Promise.all([
    import(/* webpackChunkName: "classic" */ './utils/analytics'),
    import(/* webpackChunkName: "classic" */ 'react-redux'),
    import(/* webpackChunkName: "classic" */ 'redux-persist/integration/react'),
    import(/* webpackChunkName: "classic" */ './store/store'),
    import(/* webpackChunkName: "classic" */ './App'),
    import(/* webpackChunkName: "classic" */ './reportWebVitals'),
  ]).then(([{ initGA }, { Provider }, { PersistGate }, { store, persistor }, { default: App }, { default: reportWebVitals }]) => {
    // Initialize Google Analytics
    initGA();
    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <App />
          </PersistGate>
        </Provider>
      </React.StrictMode>,
    );
    // If you want to start measuring performance in your app, pass a function
    // to log results (for example: reportWebVitals(console.log)).
    reportWebVitals();
  });
}
