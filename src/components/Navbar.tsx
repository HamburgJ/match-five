import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Navbar as BootstrapNavbar, Container, Button, Modal, Nav } from 'react-bootstrap';
import { FaInfoCircle, FaTrash, FaList } from 'react-icons/fa';
import WordTile from './WordTile';
import '../styles/Navbar.css';

const Navbar: React.FC = () => {
  const dispatch = useDispatch();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleResetData = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <>
      <BootstrapNavbar fixed="top" bg="light" expand="lg" className="custom-navbar">
        <Container>
          <BootstrapNavbar.Brand as={NavLink} to="/" className="brand-link">
            Match Five
          </BootstrapNavbar.Brand>
          <Nav className="ms-auto">
            <Nav.Link as={Button} variant="link" onClick={() => setShowInfoModal(true)}>
              <FaInfoCircle className="me-2" /> Info
            </Nav.Link>
            <Nav.Link as={NavLink} to="/levels">
              <FaList className="me-2" /> Level Select
            </Nav.Link>
            {/*
            <Nav.Link as={Button} variant="link" onClick={() => setShowResetModal(true)}>
              <FaTrash className="me-2" /> Reset
            </Nav.Link> */}

          </Nav>
        </Container>
      </BootstrapNavbar>

      <Modal show={showInfoModal} onHide={() => setShowInfoModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>How to Play</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="how-to-play-content">
            <section>
              <h5>Game Rules:</h5>
              <ul>
                <li>Words and slots are given 5 at a time</li>
                <li>Drag and drop words into slots that match their hints</li>
                <li>Unlock new sections by completing the current ones</li>
                <li>Complete a level by filling all slots correctly</li>
              </ul>
            </section>
            <section>
              <h5>Example:</h5>
              <br/>
              <ul>
                <li>
                  <WordTile word="Rose" /> matches the hint "Red"
                </li>
                <br/>
                <li>
                  <WordTile word="Rose" /> also matches the hint "Flower"
                </li>
              </ul>
            </section>
            <section>
              <h5>Tips:</h5>
              <ul>
                <li>Words can match multiple different hints</li>
                <li>Sometimes you'll need to rethink your previous choices</li>
                <li>If you get stuck, try returning words to your inventory and starting fresh</li>
                <li>New sections bring new words and possibilities!</li>
              </ul>
            </section>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowInfoModal(false)}>
            Got it!
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showResetModal} onHide={() => setShowResetModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Reset Game Progress</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to reset all game progress? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowResetModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleResetData}>
            Reset Progress
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Navbar; 