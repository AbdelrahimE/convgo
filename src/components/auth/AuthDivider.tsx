import React from 'react';

const AuthDivider: React.FC = () => {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-300" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-white px-4 text-gray-500 text-center text-xs">OR</span>
      </div>
    </div>
  );
};

export default AuthDivider;