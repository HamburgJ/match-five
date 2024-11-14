import React, { useEffect } from 'react';
import ReactGA from 'react-ga4';
import './App.css';

const App: React.FC = () => {
  useEffect(() => {
    // Initialize GA4
    if (process.env.REACT_APP_GA_TRACKING_ID) {
      ReactGA.initialize(process.env.REACT_APP_GA_TRACKING_ID);
      ReactGA.send("pageview");
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Match Five</h1>
        <p>Coming Soon!</p>
      </header>
    </div>
  );
};

export default App;
