import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import foodielogo from "../../assets/foodie.png";
import supabase from "../../client/supabase";
import "./navBar.css";

const PUBLIC_URL = [
  { path: "/homepage", label: "Home" },
  { path: "/mystory", label: "My Story" },
  { path: "/about", label: "About" },
  { path: "/education", label: "Education" },
];

const AUTH_URL = [
  { path: "/homepage", label: "Home" },
  { path: "/dailytracker", label: "Daily Tracker" },
];

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSidebar, setShowSidebar] = useState(false);
  const [loggedInText, setLoggedInText] = useState("");
  const [session, setSession] = useState(null);

  const fetchUser = async () => {
    const {data: {session}} = await supabase.auth.getSession();
    if (session) {
      setLoggedInText("Log out");
      setSession(session);
      // console.log(session)
    } else {
      setLoggedInText("Sign Up!");
    }
  };

  const clickLogo = (e) => {
    e.stopPropagation();
    if (location.pathname === "/homepage") {
      window.location.reload();
    }
    navigate("/homepage");
    setShowSidebar(false);
  };

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setShowSidebar(!showSidebar);
  };

  const handleLogin = async (e) => {
    e.stopPropagation();
    navigate("/login");
    setShowSidebar(false);
  };

  const handleLogout = async (e) => {
    e.stopPropagation();
    await supabase.auth.signOut();
    setSession(null);
    window.location.reload();
    setShowSidebar(false);
  };

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showSidebar) {
        setShowSidebar(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showSidebar]);

  // conditional for auth users or public users
  const navLinks = session ? AUTH_URL : PUBLIC_URL;

  return (
    <>
      <div className="navbar">
        <div className="nav">
          <div className="logo-container" onClick={clickLogo}>
            <img className="logo" src={foodielogo} alt="Foodie AI Logo" />
            <p className="logo-text">Foodie AI.</p>
          </div>

          <div className="navlinks">
            {navLinks.map(({ path, label }) => (
              <Link
                key={path}
                className={location.pathname === path ? "active-link" : "links"}
                to={path}
              >
                {label}
              </Link>
            ))}
            <button
              className="signup-btn"
              onClick={session ? handleLogout : handleLogin}
            >
              {loggedInText}
            </button>
          </div>
        </div>
      </div>

      <div
        onClick={handleMenuClick}
        className={`menu-bttn ${showSidebar ? "sidebar-open" : ""}`}
      >
        {!showSidebar ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="#000000"
          >
            <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="#000000"
          >
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
          </svg>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: showSidebar ? 1 : 0, x: showSidebar ? 0 : 100 }}
        transition={{ duration: 0.2 }}
        className={showSidebar ? "sidebar" : "hide"}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <motion.div
          className="sidebar-close-btn"
          onClick={() => setShowSidebar(false)}
          initial={{ scale: 0 }}
          animate={{
            scale: showSidebar ? 1 : 0,
            transition: {
              delay: showSidebar ? 0.1 : 0, //
              type: "spring",
              stiffness: 300,
              damping: 20,
            },
          }}
          whileHover={{ scale: 1.1 }}
        >
          ✕
        </motion.div>

        {navLinks.map(({ path, label }) => (
          <Link
            key={path}
            className={location.pathname === path ? "active-link" : "links"}
            to={path}
            onClick={() => setShowSidebar(false)}
          >
            {label}
          </Link>
        ))}

        <button
          onClick={session ? handleLogout : handleLogin}
          className="signup-btn--mobile"
        >
          {loggedInText}
        </button>
      </motion.div>

      {showSidebar && (
        <div
          className="sidebar-overlay"
          onClick={() => setShowSidebar(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 98,
          }}
        />
      )}
    </>
  );
};

export default Navbar;
