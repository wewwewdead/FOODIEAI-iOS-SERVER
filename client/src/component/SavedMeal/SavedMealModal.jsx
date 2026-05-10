import Modal from "react-modal";
import "./savedMealModal.css";
import { motion } from "framer-motion";

/**
  A reusable modal component using `react-modal` to confirm that a food item was successfully saved to the daily tracker.

  - react-modal: https://www.npmjs.com/package/react-modal
 
  Props:
  (1) isOpen (boolean): Controls modal visibility.
  (2) onRequestClose (function): Function to close the modal when triggered.

  @example (parent: HomePage.jsx)
  <SavedMealModal
    isOpen={showModal}
    onRequestClose={() => setShowModal(false)}
  />
 */

const SavedMealModal = ({ isOpen, onRequestClose }) => {
  return (
    <Modal
    ariaHideApp={false}
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Food data Uploaded Modal"
      className="saved-meal-modal"
      overlayClassName="saved-meal-modal-overlay"
    >
      <div className="saved-meal-container">
        <h3>This food item was saved in your daily tracker successfully!</h3>
        <motion.button 
        className="close-save-meal-bttn" 
        onClick={onRequestClose}
        whileHover={{
          scale: 1.05,
          boxShadow: "0 0 20px 2px rgba(255, 105, 180, 0.6)",
          transition: {duration: 0.2},
        }}
        >
          Close
        </motion.button>
      </div>
      
    </Modal>
  );
};

export default SavedMealModal;
