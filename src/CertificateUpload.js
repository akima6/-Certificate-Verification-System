// src/CertificateUpload.js
import React from 'react';

const CertificateUpload = () => {
  return (
    <div>
      <h2>Upload Certificate</h2>
      <input type="file" accept=".pdf,.jpg,.png" />
      <button>Upload</button>
    </div>
  );
};

export default CertificateUpload;
