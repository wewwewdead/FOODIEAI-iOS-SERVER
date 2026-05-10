import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Navbar from "./NavBar/NavBar";

export default function Layout() {
  return (
    <div className="site-wrapper">
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
