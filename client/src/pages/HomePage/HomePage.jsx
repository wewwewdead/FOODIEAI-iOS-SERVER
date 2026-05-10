import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import benefits from "../../assets/benefits.svg";
import drawbacks from "../../assets/drawbacks.svg";
import nutrients from "../../assets/nutrients.svg";
import supabase from "../../client/supabase.js";
import SavedMealModal from "../../component/SavedMeal/SavedMealModal.jsx";
import FoodUploadForm from "../../component/UploadForm/FoodUploadForm.jsx";
import { saveData, uploadFood } from "../../services/api.js";
import "./home.css";

const HomePage = () => {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [foodCoach, setFoodCoach] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [noFood, setNoFood] = useState("");
  const [showContent, setShowContent] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Upload or snap a meal to get insights!"
  );

  const [nutrientsText, setNutrientsText] = useState("");
  const [benefitsText, setBenefitsText] = useState("");
  const [drawBacksText, setDrawBacksText] = useState("");
  const [nutrientsCurrentIndex, setNutrientsCurrentIndex] = useState(0);
  const [benefitsCurrentIndex, setBenefitsCurrentIndex] = useState(0);
  const [drawBacksCurrentIndex, setDrawBacksCurrentIndex] = useState(0);

  const [switchButton, setSwitchButton] = useState(false);
  const [analyzing, setAnalyzing] = useState(false); //loading state
  const [sumbiting, setSubmitting] = useState(false); //loading state
  const [isVisible, setIsVisible] = useState(true); // visibe state of the save button
  const [showModal, setShowModal] = useState(false);

  const [session, setSession] = useState(null);

  const fileRef = useRef(null);
  const contentRef = useRef(null);
  const navigate = useNavigate();

  const typingSpeed = 20; //miliseconds per character

  const fetchUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // console.log(session)
    setSession(session);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // if(!session){
    //     return navigate('/login');
    // }
    setIsVisible(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // console.log('save clicked')
    if (!session) {
      return navigate("/login");
    }
    setSubmitting(true);
    const data = {
      cal: analysis.calories,
      sugar: analysis.sugar,
      carbs: analysis.carbs,
      foodName: analysis.food,
      userId: session.user.id,
    };
    const { success } = await saveData(data);
    setIsVisible(false);
    setSubmitting(false);
    setShowModal(true);
  };

  const handleClickUpload = (e) => {
    e.preventDefault();
    if (fileRef.current) {
      setErrorMessage("");
      setAnalysis("");
      setFoodCoach("");
      setNoFood("");
      setSwitchButton(false);
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  const handleImageChange = (e) => {
    e.preventDefault();
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const newPhoto = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (fileRef.current) {
      setSwitchButton(!switchButton);
      setNoFood("");
      setImagePreview("");
      setAnalysis("");
      setFoodCoach("");
      setFile(null);
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  const handleSubmit = async (e) => {
    setSwitchButton(!switchButton);
    setIsVisible(true);
    setAnalyzing(true);
    e.preventDefault();
    setWelcomeMessage("");
    setShowContent(true);
    setErrorMessage("");
    setAnalysis("");
    setFoodCoach("");
    setNutrientsText("");
    setBenefitsText("");
    setDrawBacksText("");
    setNutrientsCurrentIndex(0);
    setBenefitsCurrentIndex(0);
    setDrawBacksCurrentIndex(0);
    const formData = new FormData();

    if (!file) {
      setErrorMessage("Please upload a photo of your food!");
      setSwitchButton(false);
      setAnalyzing(false);
      return;
    }
    formData.append("image", file);

    try {
      const data = await uploadFood(formData);

      if (data.analysis.fallback) {
        setNoFood(data.analysis.fallback);
        // return console.log(data.analysis);
      }
      // console.log(data.analysis);
      // console.log(data.coach);
      setAnalysis(data.analysis);
      setFoodCoach(data.coach);
    } catch (error) {
      console.error("Upload error:", error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (contentRef.current && showContent) {
      contentRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [showContent, analysis]);

  useEffect(() => {
    let timer;

    // handle nutrients text rendering
    if (analysis) {
      if (
        nutrientsCurrentIndex < analysis.nutrients?.length && //checking if the nutrients array is all written
        nutrientsText.length < analysis.nutrients[nutrientsCurrentIndex]?.length
      ) {
        //checking if nutrients text is all written
        timer = setTimeout(() => {
          setNutrientsText(
            (prevText) =>
              prevText +
              analysis.nutrients[nutrientsCurrentIndex].charAt(
                nutrientsText.length
              )
          ); //using charAt(using the length of nutrientsText for getting the current index) for adding 1 letter at a time for 50milisecs
        }, typingSpeed);
      } else if (
        nutrientsText.length >=
        analysis.nutrients?.[nutrientsCurrentIndex]?.length
      ) {
        setNutrientsCurrentIndex((prevIndex) => prevIndex + 1);
        setNutrientsText("");
      }

      // handle benefits text rendering
      if (
        benefitsCurrentIndex < analysis.benefits?.length &&
        benefitsText.length < analysis.benefits[benefitsCurrentIndex]?.length
      ) {
        timer = setTimeout(() => {
          setBenefitsText(
            (prevText) =>
              prevText +
              analysis.benefits[benefitsCurrentIndex].charAt(
                benefitsText.length
              )
          );
        }, typingSpeed);
      } else if (
        benefitsText.length >= analysis.benefits?.[benefitsCurrentIndex]?.length
      ) {
        setBenefitsCurrentIndex((prevIndex) => prevIndex + 1);
        setBenefitsText("");
      }

      // handle drawbacks text rendering
      if (
        drawBacksCurrentIndex < analysis.drawbacks?.length &&
        drawBacksText.length < analysis.drawbacks[drawBacksCurrentIndex]?.length
      ) {
        timer = setTimeout(() => {
          setDrawBacksText(
            (prevText) =>
              prevText +
              analysis.drawbacks[drawBacksCurrentIndex].charAt(
                drawBacksText.length
              )
          );
        }, typingSpeed);
      } else if (
        drawBacksText.length >=
        analysis.drawbacks?.[drawBacksCurrentIndex]?.length
      ) {
        setDrawBacksCurrentIndex((prevIndex) => prevIndex + 1);
        setDrawBacksText("");
      }
    }
    return () => clearTimeout(timer);
  }, [
    typingSpeed,
    nutrientsCurrentIndex,
    benefitsCurrentIndex,
    drawBacksCurrentIndex,
    analysis,
    nutrientsText,
    benefitsText,
    drawBacksText,
  ]);

  return (
    <>
      <div className="home night-mode">
        <motion.h2
          className="home__welcome"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {welcomeMessage}
        </motion.h2>

        <FoodUploadForm
          imagePreview={imagePreview}
          handleClickUpload={handleClickUpload}
          handleImageChange={handleImageChange}
          handleSubmit={handleSubmit}
          switchButton={switchButton}
          analyzing={analyzing}
          newPhoto={newPhoto}
          noFood={noFood}
          fileRef={fileRef}
        />

        <div className="analysis">
          {/* <div className="loading-container">
            {analyzing && <p>Analyzing...</p>}
            <ClipLoader loading={analyzing} size={20} color="rgb(184 202 56)" />
          </div> */}

          {errorMessage ? (
            <h2 style={{ color: "rgb(255, 39, 39)" }}>{errorMessage}</h2>
          ) : (
            analysis && (
              <>
                <div className="calorie-sugar-carbs">
                  <motion.h2
                    className="kcal"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                  >
                    {analysis.calories} calories
                  </motion.h2>

                  <motion.h2
                    className="food-name"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                  >
                    {analysis.food}
                  </motion.h2>

                  <motion.h3
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.2 }}
                    viewport={{ once: true }}
                    className="sugar"
                  >
                    Sugar: {analysis.sugar}g
                  </motion.h3>
                  <motion.h3
                    className="carbs"
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1.5 }}
                    viewport={{ once: true }}
                  >
                    Carbs: {analysis.carbs}g
                  </motion.h3>

                  <div className="bubble-message">
                    <div className="message-container">
                      <p>{analysis.coachAdvice}</p>
                    </div>
                    <small>{foodCoach} ~~</small>
                  </div>

                  <AnimatePresence>
                    {isVisible && (
                      <motion.div
                        initial={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          scale: 0.8,
                          transition: { duration: 0.3 },
                        }}
                        transition={{ duration: 0.2 }}
                        className="save-food-bttn-container"
                      >
                        <h3>Save this in to your daily tracker?</h3>
                        <div className="loading-container">
                          {sumbiting && <p>Saving..</p>}
                          <ClipLoader
                            loading={sumbiting}
                            size={20}
                            color="rgb(184 202 56)"
                          />
                        </div>

                        <div className="bttn-container">
                          <motion.button
                            className="cancel-bttn "
                            whileHover={{ scale: 1.06 }}
                            onClick={handleCancel}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              height="24px"
                              viewBox="0 -880 960 960"
                              width="24px"
                              fill="rgb(255, 248, 248)"
                            >
                              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
                            </svg>
                          </motion.button>
                          <motion.button
                            onClick={handleSave}
                            disabled={sumbiting}
                            className="save-bttn"
                            whileHover={{ scale: 1.06 }}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              height="24px"
                              viewBox="0 -870 960 960"
                              width="24px"
                              fill="rgb(255, 248, 248)"
                            >
                              <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z" />
                            </svg>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div ref={contentRef} className="analysis-content">
                  <motion.div
                    initial={{ opacity: 0, x: -200 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="analysis-column"
                  >
                    <h2>
                      Nutrients{" "}
                      <span>
                        <img src={nutrients} alt="" />
                      </span>
                    </h2>
                    {analysis.nutrients &&
                      analysis.nutrients.map((item, index) => (
                        <p key={`nutrient${index}`}>
                          {nutrientsCurrentIndex === index && nutrientsText
                            ? nutrientsText
                            : nutrientsCurrentIndex > index
                            ? item
                            : ""}
                        </p>
                      ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 200 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="analysis-column benefits"
                  >
                    <h2>
                      Benefits{" "}
                      <span>
                        {/* NOTE: */}
                        <img src={benefits} alt="" />
                      </span>
                    </h2>
                    {analysis.benefits &&
                      analysis.benefits.map((item, index) => (
                        <p key={`benefit${index}`}>
                          {benefitsCurrentIndex === index && benefitsText
                            ? benefitsText
                            : benefitsCurrentIndex > index
                            ? item
                            : ""}
                        </p>
                      ))}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 200 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="analysis-column drawbacks"
                  >
                    <h2>
                      Drawbacks{" "}
                      <span>
                        <img src={drawbacks} alt="" />
                      </span>
                    </h2>
                    {analysis.drawbacks &&
                      analysis.drawbacks.map((item, index) => (
                        <p key={`drawback${index}`}>
                          {drawBacksCurrentIndex === index && drawBacksText
                            ? drawBacksText
                            : drawBacksCurrentIndex > index
                            ? item
                            : ""}
                        </p>
                      ))}
                  </motion.div>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* NOTE: SAVED Meal Modal */}
      <SavedMealModal
        isOpen={showModal}
        onRequestClose={() => setShowModal(false)}
      />
    </>
  );
};

export default HomePage;
