import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { logger } from '@/lib/logger';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const handleAuthError = (error, context = 'Auth') => {
    logger.error(`${context}: ${error.message}`, error);
    
    if (error.status === 403 && error.data?.extra_data?.reason) {
      const reason = error.data.extra_data.reason;
      return {
        type: reason,
        message: error.message
      };
    }
    
    if (error.status === 401 || error.status === 403) {
      return {
        type: 'auth_required',
        message: 'Authentication required'
      };
    }
    
    return {
      type: 'unknown',
      message: error.message || 'An unexpected error occurred'
    };
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      logger.info('Checking app state...');
      
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token,
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        logger.info('App public settings loaded successfully');
        
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          logger.info('No token available, skipping user auth check');
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        const authErrorObj = handleAuthError(appError, 'App state check');
        setAuthError(authErrorObj);
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      logger.error('Unexpected error during app state check', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      logger.info('Checking user authentication...');
      
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      logger.info(`User authenticated: ${currentUser.id}`);
      setIsLoadingAuth(false);
    } catch (error) {
      const authErrorObj = handleAuthError(error, 'User auth check');
      setAuthError(authErrorObj);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    logger.info(`Logging out user (redirect: ${shouldRedirect})`);
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    logger.info('Redirecting to login');
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};