import React from 'react';
import OAuthCallbackFast from './OAuthCallbackFast';

// Use the fast OAuth callback that processes immediately without complex rendering
const OAuthCallbackWrapper: React.FC = () => {
  return <OAuthCallbackFast />;
};

export default OAuthCallbackWrapper;