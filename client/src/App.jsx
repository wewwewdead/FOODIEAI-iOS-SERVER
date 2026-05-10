import { Routes, Route, Navigate } from 'react-router-dom';
import "./App.css";
import DailyTracker from "./pages/Dailytracker/DailyTracker";
import About from "./pages/About/About";
import Education from "./pages/Education/Education";
import HomePage from "./pages/HomePage/HomePage";
import LandingPage from "./pages/LandingPage/LandingPage";
import Login from "./pages/Login/Login";
import MyStory from "./pages/MyStory/MyStory";
import {useAuth} from './AuthProvider';
import Navbar from "./component/NavBar/NavBar";

function App() {
  const {user, loading: authLoading} = useAuth();

  if(authLoading){
    return(
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '24px' }}>
        Loading Application...
      </div>
    )
  }
  return(
    <>
      {user ? <Navbar/> : <Navbar/>}

      <Routes>
        <Route path="/" element={<HomePage/>} />
        <Route path="/landingpage" element={<LandingPage/>} />
        <Route path="/homepage" element={<HomePage/>} />
        <Route path="/about" element={<About />} />
        <Route path="/mystory" element={<MyStory />} />
        <Route path="/education" element={<Education />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dailytracker" element={<DailyTracker />} />
      </Routes>
    </>
  ) 
}
export default App;