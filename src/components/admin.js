
import React, { useState, useEffect, useRef } from 'react';
import Web3 from 'web3';
import axios from 'axios';
import MetaMaskOnboarding from '@metamask/onboarding';
import contractABI from "../contractABI";
import "./admin.css";

const Admin = () => {
  const [web3, setWeb3] = useState(null);
  const [userAddress, setUserAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [statusType, setStatusType] = useState(''); // 'processing', 'success', 'error'
  const [cid, setCid] = useState('');
  const [extractedDetails, setExtractedDetails] = useState(null);
  const [metadataHash, setMetadataHash] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [contract, setContract] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const pinataApiKey = process.env.REACT_APP_PINATA_API_KEY;
  const pinataSecretApiKey = process.env.REACT_APP_PINATA_SECRET_API_KEY;
  const predefinedAdminAddress = process.env.REACT_APP_ADMIN_ADDRESS;
  const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;

  const onboarding = new MetaMaskOnboarding();

  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  useEffect(() => {
    const initializeWeb3 = async () => {
      if (!window.ethereum) {
        setIsLoading(false);
        return;
      }
      try {
        const web3Instance = new Web3(window.ethereum);
        setWeb3(web3Instance);
        const accounts = await web3Instance.eth.getAccounts();
        handleAccountsChanged(accounts);
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());

        // Initialize contract after Web3 instance is ready
        const contractInstance = new web3Instance.eth.Contract(contractABI, contractAddress);
        setContract(contractInstance);
      } catch (error) {
        console.error('Error initializing Web3:', error);
        setIsLoading(false);
      }
    };

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setUserAddress('');
        setIsAdmin(false);
      } else {
        setUserAddress(accounts[0]);
        verifyAdmin(accounts[0]);
      }
      setIsLoading(false);
    };

    const verifyAdmin = (address) => {
      setIsAdmin(address.toLowerCase() === predefinedAdminAddress.toLowerCase());
    };

    initializeWeb3();
  }, [predefinedAdminAddress]);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setUploadStatus('');
      setStatusType('');
      setCid('');
      setExtractedDetails(null);
      setMetadataHash('');
      setTransactionHash('');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const extractMetadata = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setUploadStatus('Extracting metadata from certificate...');
    setStatusType('processing');
    const formData = new FormData();
    formData.append('certificate', selectedFile);

    try {
      const extractionResponse = await axios.post("http://127.0.0.1:5000/upload", formData);
      console.log("Extraction Response:", extractionResponse.data);
      setExtractedDetails(extractionResponse.data);
      setMetadataHash(extractionResponse.data?.metadata_hash || '');
      setUploadStatus('Metadata extracted successfully.');
      setStatusType('success');
    } catch (error) {
      console.error("Error extracting metadata:", error);
      setUploadStatus('Failed to extract metadata.');
      setStatusType('error');
    }
    setIsProcessing(false);
  };

  const uploadToIPFS = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setUploadStatus('Uploading to IPFS...');
    setStatusType('processing');
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const ipfsResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS", 
        formData, 
        {
          headers: {
            'pinata_api_key': pinataApiKey,
            'pinata_secret_api_key': pinataSecretApiKey
          }
        }
      );

      console.log("IPFS Response:", ipfsResponse.data);
      setCid(ipfsResponse.data.IpfsHash);
      setUploadStatus('File uploaded to IPFS successfully!');
      setStatusType('success');
    } catch (error) {
      console.error("Error uploading to IPFS:", error);
      setUploadStatus('Failed to upload file to IPFS.');
      setStatusType('error');
    }
    setIsProcessing(false);
  };

  const storeOnBlockchain = async () => {
    if (!metadataHash || !cid) {
      alert("Missing metadata hash or CID");
      return;
    }
    setIsProcessing(true);
    setUploadStatus("Sending to Blockchain...");
    setStatusType('processing');
    
    try {
      if (!contract) {
        alert("Smart contract is not initialized");
        return;
      }

      // Convert to bytes32 format (add 0x prefix)
      const bytes32Hash = web3.utils.toHex(metadataHash);
  
      // Send the transaction to the smart contract
      const receipt = await contract.methods.storeCertificate(cid, bytes32Hash)
        .send({ 
          from: userAddress, 
          gas: 5000000 
        });
  
      console.log('Transaction successful:', receipt);
      setTransactionHash(receipt.transactionHash);
      setUploadStatus("Stored on Blockchain successfully!");
      setStatusType('success');
    } catch (error) {
      console.error('Transaction failed:', error);
      let errorMessage = "Certificate already exists on blockchain";

      // Extract meaningful error message
      if (error.message.includes('revert')) {
        if (error.message.includes('Certificate already exists')) {
          errorMessage = "Certificate already exists on blockchain";
        } else if (error.message.includes('Not authorized')) {
          errorMessage = "Only admin can store certificates";
        }
      } else if (error.code === 'INSUFFICIENT_GAS') {
        errorMessage = "Transaction ran out of gas";
      } else if (error.code === 4001) {
        errorMessage = "Transaction rejected by user";
      }

      // Update status with specific error
      setUploadStatus(errorMessage);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderMetadataTable = () => {
    if (!extractedDetails) return null;
    
    // Define correct order for metadata display
    const fieldOrder = ['name', 'register_number', 'college', 'passing_date', 'cgpa'];
    const filteredDetails = fieldOrder
      .map(key => [key, extractedDetails[key]])
      .filter(([key, value]) => value); // Ensures only non-empty fields are displayed
    
    return (
      <div className="metadata-container">
        <div className="metadata-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          Certificate Metadata
        </div>
        <div className="metadata-content">
          {metadataHash && (
            <div className="metadata-group">
              <div className="metadata-label">Metadata Hash</div>
              <div className="hash-value">
                {metadataHash}
                <button 
                  className="copy-button" 
                  onClick={() => copyToClipboard(metadataHash)}
                  title="Copy to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          <table className="metadata-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredDetails.map(([key, value]) => (
                <tr key={key}>
                  <td>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderStorageSection = () => {
    return (
      <>
        {cid && (
          <div className="metadata-group">
            <div className="metadata-label">IPFS CID</div>
            <div className="hash-value">
              {cid}
              <a
                href={`https://gateway.pinata.cloud/ipfs/${cid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hash-link"
              >
                View on IPFS
              </a>
              <button 
                className="copy-button" 
                onClick={() => copyToClipboard(cid)} 
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        )}
        
        {transactionHash && (
  <div className="metadata-group">
    <div className="metadata-label">Transaction Hash</div>
    <div className="hash-value">
      {transactionHash}
      <button 
        className="copy-button" 
        onClick={() => copyToClipboard(transactionHash)}
        title="Copy to clipboard"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
  </div>
)}

      </>
    );
  };

  if (!window.ethereum) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <div className="card-header">
            <div className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <h2 className="card-title">MetaMask Required</h2>
          </div>
          <p className="metadata-label">Please install MetaMask to use the admin panel.</p>
          <button 
            className="admin-button button-primary" 
            onClick={() => onboarding.startOnboarding()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            Install MetaMask
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="admin-container">
        <div className="admin-card">
          <div className="card-header">
            <div className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            </div>
            <h2 className="card-title">Connecting to MetaMask</h2>
          </div>
          <div className="status-message status-processing">
            <div className="spinner"></div>
            Please wait while we connect to your wallet...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin Panel</h1>
          <p className="admin-subtitle">Certificate Verification System</p>
        </div>
        
        {!userAddress ? (
          <button 
            className="admin-button button-primary"
            onClick={() => window.ethereum.request({ method: 'eth_requestAccounts' })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Connect MetaMask
          </button>
        ) : (
          <div className="connection-status">
            <div className={`status-indicator ${userAddress ? 'status-connected' : 'status-disconnected'}`}></div>
            <span className="address-text">{truncateAddress(userAddress)}</span>
            <span className={`admin-status ${isAdmin ? 'admin-verified' : 'admin-unauthorized'}`}>
              {isAdmin ? '✓ Admin' : '✗ Unauthorized'}
            </span>
          </div>
        )}
      </div>

      {isAdmin ? (
        <>
          <div className="admin-card">
            <div className="card-header">
              <div className="card-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
              </div>
              <h2 className="card-title">Certificate Upload</h2>
            </div>
            
            <div 
              className={`file-upload-container ${selectedFile ? 'active' : ''}`}
              onClick={triggerFileInput}
            >
              <input 
                type="file" 
                onChange={handleFileChange} 
                ref={fileInputRef}
                className="file-upload-input" 
              />
              <label className="file-upload-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                {selectedFile ? 'Change selected file' : 'Click to select a certificate file'}
              </label>
              {fileName && <div className="file-name">{fileName}</div>}
            </div>
            
            {uploadStatus && (
              <div className={`status-message status-${statusType}`}>
                {statusType === 'processing' && <div className="spinner"></div>}
                {uploadStatus}
              </div>
            )}
            
            <div className="button-group">
              <button 
                className="admin-button button-primary" 
                onClick={extractMetadata}
                disabled={!selectedFile || isProcessing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                Extract Metadata
              </button>
              
              <button 
                className="admin-button button-secondary"
                onClick={uploadToIPFS}
                disabled={!selectedFile || isProcessing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16"></polyline>
                  <line x1="12" y1="12" x2="12" y2="21"></line>
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
                  <polyline points="16 16 12 12 8 16"></polyline>
                </svg>
                Upload to IPFS
              </button>
              
              <button 
                className="admin-button button-tertiary"
                onClick={storeOnBlockchain}
                disabled={!metadataHash || !cid || isProcessing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                Store on Blockchain
              </button>
            </div>
          </div>
          
          {extractedDetails && renderMetadataTable()}
          
          {(cid || transactionHash) && (
            <div className="admin-card">
              <div className="card-header">
                <div className="card-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </div>
                <h2 className="card-title">Storage Details</h2>
              </div>
              {renderStorageSection()}
            </div>
          )}
        </>
      ) : userAddress && (
        <div className="admin-card">
          <div className="card-header">
            <div className="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              </svg>
            </div>
            <h2 className="card-title">Access Denied</h2>
          </div>
          <div className="status-message status-error">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Your wallet address does not have admin privileges.
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
