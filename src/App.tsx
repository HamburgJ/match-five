import React, { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { Container, Row, Col } from 'react-bootstrap';
import { store } from './store/store';
import WorldSelector from './components/WorldSelector';
import Inventory from './components/Inventory';
import { loadSavedProgress } from './store/gameSlice';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

const GameContent: React.FC = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(loadSavedProgress());
  }, [dispatch]);

  return (
    <div className="App">
      <Container fluid>
        <Row>
          <Col md={8}>
            <WorldSelector />
          </Col>
          <Col md={4}>
            <div className="inventory-floating">
              <Inventory />
            </div>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

const App: React.FC = () => (
  <Provider store={store}>
    <GameContent />
  </Provider>
);

export default App;
