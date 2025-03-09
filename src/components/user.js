import React, { useState } from 'react';
import axios from 'axios';

const User = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedDetails, setExtractedDetails] = useState(null);
  const [metadataHash, setMetadataHash] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [cid, setCid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setVerificationStatus('');
    setCid('');
    setExtractedDetails(null);
    setMetadataHash('');
  };

  const extractMetadata = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setVerificationStatus('Extracting metadata from certificate...');
    const formData = new FormData();
    formData.append('certificate', selectedFile);

    try {
      const response = await axios.post("http://127.0.0.1:5000/upload", formData);
      setExtractedDetails(response.data);
      setMetadataHash(response.data?.metadata_hash || '');
      setVerificationStatus('Metadata extracted successfully. Click Verify to check authenticity.');
    } catch (error) {
      console.error("Error extracting metadata:", error);
      setVerificationStatus('Failed to extract metadata.');
    }
    setIsProcessing(false);
  };

  const verifyCertificate = async () => {
    if (!metadataHash) {
      alert("No metadata hash to verify");
      return;
    }

    setIsProcessing(true);
    setVerificationStatus('Verifying certificate on blockchain...');

    try {
      const response = await axios.post("http://127.0.0.1:5000/verify", {
        metadata_hash: metadataHash
      });

      if (response.data.cid) {
        setCid(response.data.cid);
        setVerificationStatus('✅ Certificate is valid!');
      } else {
        setVerificationStatus('❌ Certificate not found in blockchain records');
      }
    } catch (error) {
      console.error("Verification error:", error);
      setVerificationStatus('❌ Certificate verification failed');
    }
    setIsProcessing(false);
  };

  return (
    <div>
      <h1>Certificate Verification</h1>
      <input type="file" onChange={handleFileChange} />
      
      <button 
        onClick={extractMetadata} 
        disabled={!selectedFile || isProcessing}
      >
        Extract Metadata
      </button>
      
      <button 
        onClick={verifyCertificate} 
        disabled={!metadataHash || isProcessing}
      >
        Verify Certificate
      </button>

      {verificationStatus && <p>{verificationStatus}</p>}

      {extractedDetails && (
        <div>
          <h3>Extracted Metadata:</h3>
          <pre>{JSON.stringify(extractedDetails, null, 2)}</pre>
        </div>
      )}

      {cid && (
        <div>
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
  );
};

export default User;