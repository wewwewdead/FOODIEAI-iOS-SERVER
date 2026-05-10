import { useNavigate } from "react-router-dom";
import Footer from "../../component/Footer";
import "./landingPage.css";

const LandingPage = () => {
  const navigate = useNavigate();

  const handleClick = (e) => {
    e.stopPropagation();
    navigate("/homepage");
  };

  return (
    <div className="landingpage">
      <div className="landing__container">
        <div className="landing__background">
          <div className="home-btn">
            <button className="shiny-button" onClick={handleClick}>
              <span className="shine" />
              Try for FREE
            </button>
          </div>
        </div>

        <div className="logo__box">
          <span className="logo__text">Foodie Ai.</span>
        </div>

        <div className="slogan">
          <div className="slogan__wrapper">
            <h2>
              Curious about your meal? Foodie uses a little AI magic to break
              down what you're eating.
            </h2>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default LandingPage;
