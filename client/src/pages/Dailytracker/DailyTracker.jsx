import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipLoader } from "react-spinners";
import supabase from "../../client/supabase";
import { fetchFoodLogs } from "../../services/api";
import Footer from "../../component/Footer";
import Navbar from "../../component/NavBar/NavBar";
import './dailytracker.css'

const DailyTracker = () => {
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState(null);

  const [isLoading, setIsLoading] = useState(false); //state loading

  const navigate = useNavigate();

  const fetchData = async () => {
    setIsLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return navigate("/login");
    }
    const userId = session.user.id;
    const response = await fetchFoodLogs(userId);
    // console.log(response);
    if (response.data) {
      setTotals(response.totals);
      setData(response.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <>
      <Navbar />
      <div className="parent-container">
        <div className="app-container">
          <div className="app-body-container">
            <div className="food-data-parent">
              <motion.div className="date-today">
                <h2>
                  Today,{" "}
                  {new Date().toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                  })}
                </h2>

                <motion.div
                  animate={{
                    y: [0, 5, -4, 1, -3, 0],
                    transition: {
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "loop",
                      ease: "easeInOut",
                    },
                  }}
                  className="reminder"
                >
                  <p>Daily tracker resets every 12:00 am</p>
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={
                  !isLoading
                    ? {
                        opacity: 1,
                        transition: { duration: 0.5, ease: "easeInOut" },
                      }
                    : {}
                }
                className="totals"
              >
                {totals && (
                  <>
                    <div className="total-calories">
                      <h1>{totals.totalCalories}</h1>
                      <p>total calories</p>
                    </div>
                    <div className="total-sugar-carbs">
                      <p>Total sugar: {totals.totalSugar}g</p>
                      <p>Total carbs: {totals.totalCarbs}g</p>
                    </div>
                  </>
                )}
              </motion.div>
              {isLoading ? (
                <div className="loading-container">
                  <p>Loading...</p>
                  <ClipLoader loading={isLoading} size={20} color="#fcfff8" />
                </div>
              ) : data.length > 0 ? (
                data.map((foodData, index) => (
                  <div className="food-data-container" key={foodData.id}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={
                        !isLoading
                          ? {
                              opacity: 1,
                              transition: {
                                duration: 0.5 + index * 0.2,
                                delay: index * 0.2,
                                ease: "easeInOut",
                              },
                            }
                          : {}
                      }
                      className="food-data-children"
                    >
                      <small className="date-food">
                        {new Date(foodData.created_at).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          }
                        )}
                      </small>
                      <h3>{foodData.food_name}</h3>
                      <div>
                        <p>Calories: {foodData.calories}</p>
                        <p>Sugar: {foodData.sugar}g</p>
                        <p>Carbs: {foodData.carbs}g</p>
                      </div>
                    </motion.div>
                  </div>
                ))
              ) : (
                <div>
                  <p>No data yet!</p>
                </div>
              )}
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </>
  );
};

export default DailyTracker;
