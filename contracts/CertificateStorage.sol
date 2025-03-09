// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CertificateStorage {
    address public admin;
    
    struct Certificate {
        string ipfsCid;
        bytes32 metadataHash;
    }

    mapping(bytes32 => Certificate) public certificates;

    event CertificateStored(bytes32 indexed metadataHash, string ipfsCid);
    event CertificateRetrieved(bytes32 indexed metadataHash, string ipfsCid);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: Only the admin can perform this action");
        _;
    }

    constructor() {
        admin = msg.sender;
        require(admin != address(0), "Invalid admin address"); // Ensure admin is a valid address
    }

    function storeCertificate(string memory ipfsCid, bytes32 metadataHash) public onlyAdmin {
        // Prevent storing the same certificate again
        require(certificates[metadataHash].metadataHash == 0, "Certificate already stored with this metadata hash");
        
        certificates[metadataHash] = Certificate(ipfsCid, metadataHash);
        emit CertificateStored(metadataHash, ipfsCid);
    }

    // Removed 'view' from this function
    function getCertificate(bytes32 metadataHash) public returns (string memory) {
        // Ensure that the certificate exists
        require(certificates[metadataHash].metadataHash != 0, "Certificate not found for the given metadata hash");
        
        // Emit an event for tracking purposes
        emit CertificateRetrieved(metadataHash, certificates[metadataHash].ipfsCid);

        return certificates[metadataHash].ipfsCid;
    }
}
