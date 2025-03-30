
import React from "react";

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg 
      width="30" 
      height="30" 
      viewBox="0 0 30 30" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        d="M12 2C6.477 2 2 6.477 2 12C2 14.136 2.73 16.116 3.975 17.7L2.943 21.057L6.3 20.025C7.884 21.27 9.864 22 12 22C17.523 22 22 17.523 22 12C22 6.477 17.523 2 12 2ZM16 13H13V16C13 16.552 12.552 17 12 17C11.448 17 11 16.552 11 16V13H8C7.448 13 7 12.552 7 12C7 11.448 7.448 11 8 11H11V8C11 7.448 11.448 7 12 7C12.552 7 13 7.448 13 8V11H16C16.552 11 17 11.448 17 12C17 12.552 16.552 13 16 13Z" 
        fill="currentColor"
      />
    </svg>
  );
}

export function LogoWithText({ className }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img 
        src="https://okoaoguvtjauiecfajri.supabase.co/storage/v1/object/sign/avatars/convgo.com-logo.png?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJhdmF0YXJzL2NvbnZnby5jb20tbG9nby5wbmciLCJpYXQiOjE3NDMyOTM0ODcsImV4cCI6MTc3NDgyOTQ4N30.4byW0YYrYx1bjSkNAYT01hDkSX-ypmNVCF2pUyDv5ZY" 
        alt="ConvGo.com Logo" 
        className="h-8 w-auto object-contain"
      />
    </div>
  );
}
