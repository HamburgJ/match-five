import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Navbar as BootstrapNavbar, Container, Button, Modal, Nav } from 'react-bootstrap';
import { FaInfoCircle, FaTrash, FaList } from 'react-icons/fa';
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

      <Modal show={showInfoModal} onHide={() => setShowInfoModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>How to Play</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h5>Game Rules:</h5>
          <ul>
            <li>Complete each level by matching five words correctly</li>
            <li>Drag and drop words into the correct slots</li>
            <li>Click words to add them to your inventory for later use</li>
            <li>Complete all levels in a pack to unlock new challenges</li>
          </ul>
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