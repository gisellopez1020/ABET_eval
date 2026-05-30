import { Configuration, PopupRequest } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || 'PLACEHOLDER',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'PLACEHOLDER'}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest: PopupRequest = {
  scopes: ['User.Read', 'Files.ReadWrite'],
};

export const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
