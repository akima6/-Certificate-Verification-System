import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import axios from 'axios';
import MetaMaskOnboarding from '@metamask/onboarding';

const Admin = () => {
  const [web3, setWeb3] = useState(null);
  const [userAddress, setUserAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [cid, setCid] = useState('');
  const [extractedDetails, setExtractedDetails] = useState(null);
  const [metadataHash, setMetadataHash] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [contract, setContract] = useState(null);

  const pinataApiKey = "448f46db0e59b4be0750";
  const pinataSecretApiKey = "be1d439cf9fd2c568553680b86a2959a63b7ef02612d5651bf2ae2af7a5d36c1";
  const predefinedAdminAddress = "0xA1ae7Ac74F2468937cB02846AB78442B2a355cB4";


  const contractABI =  [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "metadataHash",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "ipfsCid",
          "type": "string"
        }
      ],
      "name": "CertificateRetrieved",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "metadataHash",
          "type": "bytes32"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "ipfsCid",
          "type": "string"
        }
      ],
      "name": "CertificateStored",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "admin",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "name": "certificates",
      "outputs": [
        {
          "internalType": "string",
          "name": "ipfsCid",
          "type": "string"
        },
        {
          "internalType": "bytes32",
          "name": "metadataHash",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function",
      "constant": true
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "ipfsCid",
          "type": "string"
        },
        {
          "internalType": "bytes32",
          "name": "metadataHash",
          "type": "bytes32"
        }
      ],
      "name": "storeCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "metadataHash",
          "type": "bytes32"
        }
      ],
      "name": "getCertificate",
      "outputs": [
        {
          "internalType": "string",
          "name": "",
          "type": "string"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
  const contractAddress = "0xcB76eD0Fef39103E0bc7A13f571542986996e114"; // Replace with your deployed contract address

  const onboarding = new MetaMaskOnboarding();

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
         setContract(contractInstance); // Set contract instance to state

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
  }, []);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadStatus('');
    setCid('');
    setExtractedDetails(null);
    setMetadataHash('');
    setTransactionHash('');
  };

  const extractMetadata = async () => {
    if (!selectedFile) {
      alert("Please select a file first!");
      return;
    }

    setIsProcessing(true);
    setUploadStatus('Extracting metadata from certificate...');
    const formData = new FormData();
    formData.append('certificate', selectedFile);

    try {
      const extractionResponse = await axios.post("http://127.0.0.1:5000/upload", formData);
      console.log("Extraction Response:", extractionResponse.data);
      setExtractedDetails(extractionResponse.data);
      setMetadataHash(extractionResponse.data?.metadata_hash || '');
      setUploadStatus('✅ Metadata extracted successfully.');
    } catch (error) {
      console.error("Error extracting metadata:", error);
      setUploadStatus('❌ Failed to extract metadata.');
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
      setUploadStatus('✅ File uploaded to IPFS successfully!');
    } catch (error) {
      console.error("Error uploading to IPFS:", error);
      setUploadStatus('❌ Failed to upload file to IPFS.');
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
    
    try {
      if (!contract) {
        alert("Smart contract is not initialized");
        return;
      }

       // Convert to bytes32 format (add 0x prefix)
    const bytes32Hash = web3.utils.toHex(metadataHash);
  
      // Send the transaction to the smart contract
      const receipt = await contract.methods.storeCertificate(cid,bytes32Hash)
        .send({ from: userAddress, gas: 5000000 });
  
      console.log('Transaction successful:', receipt);
      setTransactionHash(receipt.transactionHash);  // Update with actual transaction hash
      setUploadStatus("✅ Stored on Blockchain successfully!");
    } catch (error) {
      console.error('Transaction failed:', error);
  
      // Handle the revert error more clearly
      if (error.message.includes('revert')) {
        console.error('Transaction reverted. Check contract logic or inputs.');
      }
  
      setUploadStatus("❌ Failed to store on Blockchain.");
    }
  
    setIsProcessing(false);
  };
  
  

  if (!window.ethereum) {
    return (
      <div>
        <button onClick={() => onboarding.startOnboarding()}>
          Install MetaMask
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <div>Connecting to MetaMask...</div>;
  }

  return (
    <div>
      <h1>Admin Panel</h1>
      {!userAddress ? (
        <button onClick={() => window.ethereum.request({ method: 'eth_requestAccounts' })}>
          Connect MetaMask
        </button>
      ) : (
        <>
          <p>Connected Account: {userAddress}</p>
          <p>{isAdmin ? '✅ Admin Verified' : '❌ Unauthorized Access'}</p>
        </>
      )}

      {isAdmin && (
        <>
          <input type="file" onChange={handleFileChange} />
          <button 
            onClick={extractMetadata} 
            disabled={!selectedFile || isProcessing}
          >
            Extract Metadata
          </button>
          <button 
            onClick={uploadToIPFS} 
            disabled={!selectedFile || isProcessing}
          >
            Upload to IPFS
          </button>
          <button 
            onClick={storeOnBlockchain} 
            disabled={!metadataHash || !cid || isProcessing}
          >
            Store on Blockchain
          </button>
          
          {uploadStatus && <p>{uploadStatus}</p>}
          {cid && (
            <p>
              IPFS CID:{" "}
              <a
                href={`https://gateway.pinata.cloud/ipfs/${cid}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {cid}
              </a>
            </p>
          )}
          {transactionHash && <p>Transaction Hash: {transactionHash}</p>}
          
          {extractedDetails && (
            <div>
              <h3>Extracted Metadata:</h3>
              <pre>{JSON.stringify(extractedDetails, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Admin;