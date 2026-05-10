import { motion } from "framer-motion";
import uploadCamera from "../../assets/upload.svg";
import "./foodUploadForm.css";

const FoodUploadForm = ({
  imagePreview,
  handleClickUpload,
  handleImageChange,
  handleSubmit,
  switchButton,
  analyzing,
  newPhoto,
  noFood,
  fileRef,
}) => {
  return (
    <motion.form
      onSubmit={handleSubmit}
      className="form__container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 12 }}
    >
      <input
        ref={fileRef}
        style={{ display: "none" }}
        onChange={handleImageChange}
        type="file"
        accept="image/*"
        id="imageInput"
      />

      <div className="form__upload-wrapper">
        {imagePreview ? (
          <div
            className="form__upload--empty form__upload--image"
            style={{ backgroundImage: `url(${imagePreview})` }}
            onClick={handleClickUpload}
          >
            <div className="form__upload-overlay">
              <img
                src={uploadCamera}
                alt="Change photo"
                className="form__upload-cam"
              />
              <p>Change Photo</p>
            </div>
          </div>
        ) : (
          <div onClick={handleClickUpload} className="form__upload--empty">
            <p>Meal Snap!</p>
            <img src={uploadCamera} alt="" className="form__upload-cam" />
          </div>
        )}
      </div>

      {noFood && (
        <h2 style={{ color: "rgb(255, 39, 39)" }}>No food detected!</h2>
        )}

      {/* Show button only if image is uploaded */}
      {imagePreview && (
        <motion.button
          key={switchButton ? "newPhotoBtn" : "analyzeBtn"}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          disabled={analyzing}
          onClick={switchButton ? newPhoto : undefined}
          type={switchButton ? "button" : "submit"}
          className={switchButton ? "" : "form__analyze"}
        >
          {analyzing
            ? "Analyzing..."
            : switchButton
            ? "Analyze new food"
            : "Analyze"}
        </motion.button>
      )}
    </motion.form>
  );
};

export default FoodUploadForm;
