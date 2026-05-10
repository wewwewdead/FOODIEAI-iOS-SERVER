import { motion } from "framer-motion";
import "./education.css";

const Education = () => {
  return (
    <div className="education">
      <motion.div
        className="education__title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="education__title-name">Education mode</h1>
        <p className="education__title-description">Fun facts about foods!</p>
      </motion.div>

      <motion.div
        className="education__content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 12 }}
      >
        <div className="card">
          <h2>Why fiber is important</h2>
          <p className="text">
            <span>Cancer Prevention</span>: Some studies link high fiber intake,
            especially from whole grains and fruits, to lower risks of
            colorectal cancer, possibly due to improved digestion and reduced
            toxin exposure in the colon.
          </p>
          <p className="text">
            <span>Heart Health: </span>Fiber, particularly soluble, lowers LDL
            ("bad") cholesterol by binding bile acids, forcing the body to use
            cholesterol to produce more bile. It also reduces inflammation and
            blood pressure, lowering heart disease risk.
          </p>
        </div>

        <div className="card">
          <h2>Carbs</h2>
          <p className="text">
            <span>Good carbs</span> are complex, unrefined carbohydrates found
            in whole grains, legumes, vegetables, and fruits. They are high in
            fiber and nutrients, providing sustained energy, supporting
            digestion, and promoting heart health.
          </p>
          <p className="text">
            <span>Bad carbs</span> are refined carbohydrates, like sugary
            drinks, sweets, and processed snacks, low in fiber and nutrients.
            They cause rapid blood sugar spikes, contribute to weight gain, and
            increase risks of diabetes and heart disease.
          </p>
        </div>

        <div className="card">
          <h2>How sugar affects body</h2>
          <p className="text">
            Sugar causes rapid blood sugar spikes, triggering insulin release
            and temporary energy boosts, but excess intake leads to weight gain,
            insulin resistance, and increased risks of type 2 diabetes, heart
            disease, and fatty liver. It also harms dental health, disrupts gut
            microbiota, accelerates skin aging, and may impair cognitive
            function and mental health over time.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Education;
