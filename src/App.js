import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Admin from "./components/admin";
import User from "./components/user";
import "./App.css";

// Icons component for buttons
const AdminIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const VerifyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

const BackgroundShapes = () => (
  <div className="background-shapes">
    <div className="shape shape-1"></div>
    <div className="shape shape-2"></div>
    <div className="shape shape-3"></div>
  </div>
);

const Home = () => (
  <div className="container">
    <BackgroundShapes />
    
    <div className="card-container">
      <h1>Certificate Verification Portal</h1>
      
      <p className="description">
        Securely issue and verify digital certificates with our trusted verification system. 
        Our platform ensures authenticity and integrity for all your certification needs.
      </p>
      
      <div className="button-group">
        <Link to="/admin">
          <button className="issue-btn">
            <AdminIcon /> Admin Portal
          </button>
        </Link>
        <Link to="/user">
          <button className="verify-btn">
            <VerifyIcon /> Verify Certificate
          </button>
        </Link>
      </div>
    </div>
    
    <div className="footer">
      <p>© 2025 Certificate Verification System | Secure • Trustworthy • Efficient</p>
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
      </Routes>
    </Router>
  );
};

export default App;
