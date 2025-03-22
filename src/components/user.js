
import React, { useState } from 'react';
import axios from 'axios';
import Web3 from "web3";
import './user.css';

const User = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedDetails, setExtractedDetails] = useState(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [cid, setCid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    register_number: '',
    college: '',
    passing_date: '',
    cgpa: ''
  });

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setVerificationStatus('');
    setCid('');
    setExtractedDetails(null);
    setStatusType('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value.toUpperCase()
    });
  };

  const toggleEntryMode = () => {
    setManualEntry(!manualEntry);
    setExtractedDetails(null);
    setVerificationStatus('');
    setCid('');
    if (!manualEntry) {
      setFormData({
        name: '',
        register_number: '',
        college: '',
        passing_date: '',
        cgpa: ''
      });
    }
  };

  const extractMetadata = async () => {
    if (!selectedFile && !manualEntry) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setVerificationStatus('Extracting metadata from certificate...');
    setStatusType('processing');

    try {
      let response;
      if (manualEntry) {
        if (!formData.name || !formData.register_number || !formData.college || 
            !formData.passing_date || !formData.cgpa) {
          setVerificationStatus('Please fill all required fields.');
          setStatusType('error');
          setIsProcessing(false);
          return;
        }
        response = await axios.post("http://127.0.0.1:5000/manual-entry", formData);
      } else {
        const formDataObj = new FormData();
        formDataObj.append('certificate', selectedFile);
        response = await axios.post("http://127.0.0.1:5000/upload", formDataObj);
      }

      if (!response.data.metadata_hash) {
        setVerificationStatus('Backend did not return a metadata hash.');
        setStatusType('error');
        setIsProcessing(false);
        return;
      }

      const uppercaseData = {};
      for (const key in response.data) {
        if (typeof response.data[key] === 'string' && key !== 'metadata_hash') {
          uppercaseData[key] = response.data[key].toUpperCase();
        } else {
          uppercaseData[key] = response.data[key];
        }
      }
      setExtractedDetails(uppercaseData);
      setVerificationStatus('Metadata extracted successfully. Click Verify to check authenticity.');
      setStatusType('success');
    } catch (error) {
      console.error("Error extracting metadata:", error);
      if (error.response) {
        setVerificationStatus(`Failed to extract metadata: ${error.response.data.error || 'Unknown error'}`);
      } else {
        setVerificationStatus('Failed to extract metadata.');
      }
      setStatusType('error');
    }
    setIsProcessing(false);
  };

  const verifyCertificate = async () => {
    if (!extractedDetails?.metadata_hash) {
      alert("No metadata to verify");
      return;
    }
    
    setIsProcessing(true);
    setVerificationStatus('Verifying certificate on blockchain...');
    setStatusType('processing');
    
    try {
      // Reintroduced: Hash the metadata_hash using soliditySha3 (Keccak-256)
      const web3 = new Web3(window.ethereum);
      const hashedMetadata = web3.utils.soliditySha3(extractedDetails.metadata_hash);
      console.log("Hashed metadata for verification:", hashedMetadata);

      const response = await axios.post("http://127.0.0.1:5000/verify", {
        metadata_hash: hashedMetadata // Send hashed metadata
      });
      
      console.log("Verification response:", response.data);
      
      if (response.data.cid) {
        setCid(response.data.cid);
        setVerificationStatus('✅ Certificate is valid!');
        setStatusType('success');
      } else {
        setVerificationStatus('❌ Certificate not found in blockchain records');
        setStatusType('error');
      }
    } catch (error) {
      console.error("Verification error:", error);
      if (error.response) {
        setVerificationStatus(`❌ Certificate verification failed: ${error.response.data.error || 'Unknown error'}`);
      } else {
        setVerificationStatus('❌ Certificate verification failed');
      }
      setStatusType('error');
    }
    
    setIsProcessing(false);
  };

  return (
    <div className="container">
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>
      
      <h1>Certificate Verification</h1>
      
      <div className="verification-container">
        <div className="entry-mode-toggle">
          <button 
            className={`toggle-btn ${!manualEntry ? 'active' : ''}`} 
            onClick={() => manualEntry && toggleEntryMode()}
          >
            Upload Certificate
          </button>
          <button 
            className={`toggle-btn ${manualEntry ? 'active' : ''}`} 
            onClick={() => !manualEntry && toggleEntryMode()}
          >
            Manual Entry
          </button>
        </div>

        {!manualEntry ? (
          <div className="file-input-container">
            <label htmlFor="certificate-file">
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span>Click to upload a certificate</span>
              {selectedFile && <div className="file-name">{selectedFile.name}</div>}
            </label>
            <input 
              type="file" 
              id="certificate-file"
              onChange={handleFileChange} 
              accept=".pdf"
            />
          </div>
        ) : (
          <div className="manual-entry-form">
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input 
                type="text" 
                id="name" 
                name="name" 
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter student name"
                className="uppercase-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="register_number">Register Number</label>
              <input 
                type="text" 
                id="register_number" 
                name="register_number"
                value={formData.register_number}
                onChange={handleInputChange}
                placeholder="Enter register number"
                className="uppercase-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="college">College</label>
              <input 
                type="text" 
                id="college" 
                name="college"
                value={formData.college}
                onChange={handleInputChange}
                placeholder="Enter college name"
                className="uppercase-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="passing_date">Passing Date</label>
              <input 
                type="text" 
                id="passing_date" 
                name="passing_date"
                value={formData.passing_date}
                onChange={handleInputChange}
                placeholder="Format: MONTH-YEAR (e.g., SEPTEMBER-2020)"
                className="uppercase-input"
              />
            </div>
            <div className="form-group">
              <label htmlFor="cgpa">CGPA</label>
              <input 
                type="text" 
                id="cgpa" 
                name="cgpa"
                value={formData.cgpa}
                onChange={handleInputChange}
                placeholder="Enter CGPA"
                className="uppercase-input"
              />
            </div>
          </div>
        )}
        
        <div className="button-group">
          <button 
            className="extract-btn"
            onClick={extractMetadata} 
            disabled={(!selectedFile && !manualEntry) || isProcessing}
          >
            {isProcessing && <div className="loader"></div>}
            {manualEntry ? 'Save Metadata' : 'Extract Metadata'}
          </button>
          
          <button 
            className="verify-btn"
            onClick={verifyCertificate} 
            disabled={!extractedDetails || isProcessing}
          >
            {isProcessing && <div className="loader"></div>}
            Verify Certificate
          </button>
        </div>

        {verificationStatus && (
          <div className={`status-message status-${statusType}`}>
            {verificationStatus}
          </div>
        )}
        
        {extractedDetails && (
          <div className="metadata-card">
            <div className="metadata-header">
              <svg className="metadata-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
              <span>Certificate Metadata</span>
            </div>
            
            <div className="metadata-table-container">
              <table className="metadata-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                {['name', 'register_number', 'college', 'passing_date', 'cgpa']
                  .filter(key => extractedDetails[key]) // Ensure only existing fields are displayed
                  .map(key => (
                  <tr key={key}>
                    <td className="field-name">{key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')}</td>
                    <td className="field-value metadata-value">{extractedDetails[key]}</td>
                  </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {cid && (
          <div className="verified-result">
            <h3>Valid Certificate Found!</h3>
            <p>
              View original certificate: {" "}
              <a
              
                href={`https://gateway.pinata.cloud/ipfs/${cid}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                IPFS Link
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default User;
