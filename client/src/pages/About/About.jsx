import { motion } from "framer-motion";
import "./about.css";

const About = () => {
  return (
    <div className="about">
      <motion.div
        className="about__title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="about__title-name">Foodie Ai.</h1>
        <p className="about__title-description">
          A food analyzer tool that uses multi-modal AI — powerful and
          efficient.
        </p>
      </motion.div>

      <motion.div
        className="about__content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 110, damping: 12 }}
      >
        <div className="card">
          <h2>How It Works</h2>
          <div>
            <p className="text">(1) Upload a photo</p>
            <p className="text">(2) AI analyzes your photo</p>
          </div>
          <p>
            I use Google's Gemini 1.5 Flash Preview — an AI model that can
            generate text from images and is optimized for adaptive thinking and
            reasoning.
          </p>
          <p className="output">&#10003; Get instant and structured results</p>
        </div>

        <div className="card">
          <h2>Why I Built This</h2>
          <p className="text">
            I believe that healthy eating should be accessible to everyone.
            FoodieAI helps users make smarter food choices with just a photo.
          </p>
          <p className="output">
            By helping users understand the nutritional value of their meals and
            make more informed food choices.
          </p>
        </div>

        <div className="card">
          <h2>
            How I Built <span>foodieAi.</span>
          </h2>
          <p className="text">Built with purpose and passion.</p>
          <p className="text">
            I combine cutting-edge technology (Google Gemini) with my knowledge
            of programming to make food analysis fast and accessible.
          </p>
          <p className="output">
            Every line of code was written with one goal: to help people make
            better food choices effortlessly.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default About;
