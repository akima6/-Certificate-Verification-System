
import React, { useState } from 'react';
import axios from 'axios';
import './user.css';
import Web3 from "web3";

const User = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedDetails, setExtractedDetails] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [cid, setCid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setVerificationStatus('');
    setCid('');
    setExtractedDetails(null);
    setStatusType('');
  };

  const extractMetadata = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setVerificationStatus('Extracting metadata from certificate...');
    setStatusType('processing');
    const formData = new FormData();
    formData.append('certificate', selectedFile);

    try {
      const response = await axios.post("http://127.0.0.1:5000/upload", formData);
      setExtractedDetails(response.data);
      setVerificationStatus('Metadata extracted successfully. Click Verify to check authenticity.');
      setStatusType('success');
    } catch (error) {
      console.error("Error extracting metadata:", error);
      setVerificationStatus('Failed to extract metadata.');
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
        const web3 = new Web3(window.ethereum);
        const hashedMetadata = web3.utils.soliditySha3(extractedDetails.metadata_hash); // Hash it

        const response = await axios.post("http://127.0.0.1:5000/verify", {
            metadata_hash: hashedMetadata  // Send hashed metadata
        });

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
        setVerificationStatus('❌ Certificate verification failed');
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
          />
        </div>
        
        <div className="button-group">
          <button 
            className="extract-btn"
            onClick={extractMetadata} 
            disabled={!selectedFile || isProcessing}
          >
            {isProcessing && <div className="loader"></div>}
            Extract Metadata
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
                  <td className="field-value">{extractedDetails[key]}</td>
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
