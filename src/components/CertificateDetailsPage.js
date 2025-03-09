import React from 'react';
import { useLocation } from 'react-router-dom';

const CertificateDetailsPage = () => {
    const location = useLocation();
    const { certificateDetails } = location.state || {};

    if (!certificateDetails) {
        return <div className="certificate-details"><p>No certificate details found.</p></div>;
    }

    return (
        <div className="certificate-details-page">
            <h2>Certificate Verification Results</h2>
            <div className="certificate-info">
                <p><strong>Name:</strong> {certificateDetails.name}</p>
                <p><strong>Register Number:</strong> {certificateDetails.register_number}</p>
                <p><strong>Passing Date:</strong> {certificateDetails.passing_date}</p>
                <p><strong>College:</strong> {certificateDetails.college}</p>
                <p><strong>CGPA:</strong> {certificateDetails.cgpa}</p>
            </div>
        </div>
    );
};

export default CertificateDetailsPage;