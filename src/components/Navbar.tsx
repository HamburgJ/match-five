import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Navbar as BootstrapNavbar, Container, Button, Modal, Nav } from 'react-bootstrap';
import { FaInfoCircle, FaList } from 'react-icons/fa';
import WordTile from './WordTile';
import { prefersReducedMotion } from '../utils/motion';
import '../styles/Navbar.css';

// There is deliberately no "reset progress" control. burgerfun.ca serves every
// game from one origin, so clearing storage would also wipe every other game's
// saves and the Burgerverse wallet. Match Five's own progress lives under one
// key (constants/storage.ts) and "Play Again" resets a level.

const Navbar: React.FC = () => {
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <>
      <BootstrapNavbar fixed="top" bg="light" expand="lg" className="custom-navbar">
        <Container>
          <BootstrapNavbar.Brand as={NavLink} to="/" className="brand-link">
            Match Five
          </BootstrapNavbar.Brand>
          <BootstrapNavbar.Toggle aria-controls="main-navbar-nav" />
          <BootstrapNavbar.Collapse id="main-navbar-nav">
            <Nav className="ms-auto">
              <Nav.Link as={Button} variant="link" onClick={() => setShowInfoModal(true)}>
                <FaInfoCircle className="me-2" /> Info
              </Nav.Link>
              <Nav.Link as={NavLink} to="/levels">
                <FaList className="me-2" /> Level Select
              </Nav.Link>
            </Nav>
          </BootstrapNavbar.Collapse>
        </Container>
      </BootstrapNavbar>

      <Modal show={showInfoModal} onHide={() => setShowInfoModal(false)} size="lg" animation={!prefersReducedMotion()}>
        <Modal.Header closeButton>
          <Modal.Title>How to Play</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="how-to-play-content">
            <section>
              <h5>Game Rules:</h5>
              <ul>
                <li>Words and headings arrive five at a time</li>
                <li>Tap a word, then tap the heading it belongs under. Dragging works too.</li>
                <li>A slot turns green when its word fits and red when it does not</li>
                <li>When every slot so far is green, the next five words and headings arrive</li>
                <li>Complete a level by filling every slot correctly</li>
              </ul>
            </section>
            <section>
              <h5>Example:</h5>
              <br/>
              <ul>
                <li>
                  <WordTile word="Rose" disableHover /> fits the heading "Red"
                </li>
                <br/>
                <li>
                  <WordTile word="Rose" disableHover /> also fits "Flower"
                </li>
              </ul>
            </section>
            <section>
              <h5>Tips:</h5>
              <ul>
                <li>Many words fit more than one heading</li>
                <li>A new word may only fit a slot you already filled, so you will move earlier words</li>
                <li>If you get stuck, press Return all words and start again</li>
              </ul>
            </section>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowInfoModal(false)}>
            Got it
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Navbar;
