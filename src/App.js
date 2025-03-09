import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Admin from "./components/admin";
import User from "./components/user";
import CertificateDetailsPage from "./components/CertificateDetailsPage";
import "./App.css";

const Home = () => (
  <div className="container">
    <h1>Certificate Verification Portal</h1>

    <div className="button-group">
      <Link to="/admin">
        <button className="issue-btn">Admin</button>
      </Link>
      <Link to="/user">
        <button className="verify-btn">User</button>
      </Link>
    </div>
  </div>
);

const App = () => { 
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/user" element={<User />} />
        <Route path="/certificate-details" element={<CertificateDetailsPage />} />
      </Routes>
    </Router>
  );
};

export default App;