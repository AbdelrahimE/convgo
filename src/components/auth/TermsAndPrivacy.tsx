import React from 'react';

const TermsAndPrivacy: React.FC = () => {
  return (
    <p className="text-xs text-gray-500 text-center mt-3">
      By continuing, you agree to our{' '}
      <a 
        href="/terms" 
        className="hover:text-blue-600 transition-colors duration-200"
      >
        Terms
      </a>
      {' '}and{' '}
      <a 
        href="/privacy" 
        className="hover:text-blue-600 transition-colors duration-200"
      >
        Privacy
      </a>
      .
    </p>
  );
};

export default TermsAndPrivacy;