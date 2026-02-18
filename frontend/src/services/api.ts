/**
 * API service for backend communication
 */

// Get API URL from environment or default to backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.DEV ? 'http://localhost:3001' : '');

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  fullName: string;
  timezone: string;
  phoneNumber?: string;
}

export interface SigninRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  email: string;
  token: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    email_confirmed: boolean;
  };
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    expires_in: number;
  };
}

/**
 * Make API request with proper error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Log error for debugging
      console.error('API Error:', {
        endpoint,
        status: response.status,
        error: data.error,
        details: data.details,
        fullResponse: data,
      });

      return {
        success: false,
        error: data.error || `Request failed with status ${response.status}`,
        message: data.message,
        data: data.details ? { ...data, retryAfter: data.retryAfter } : data,
      };
    }

    return {
      success: true,
      data: data,
      message: data.message,
    };
  } catch (error: any) {
    console.error('API Request Exception:', {
      endpoint,
      error: error.message,
      errorObject: error,
    });
    return {
      success: false,
      error: error.message || 'Network error occurred',
    };
  }
}

/**
 * Auth API functions
 */
export const authApi = {
  /**
   * Sign up a new user
   */
  signup: async (request: SignupRequest): Promise<ApiResponse<AuthResponse>> => {
    return apiRequest<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Sign in an existing user
   */
  signin: async (request: SigninRequest): Promise<ApiResponse<AuthResponse>> => {
    return apiRequest<AuthResponse>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Verify email with OTP
   */
  verifyEmail: async (request: VerifyEmailRequest): Promise<ApiResponse<AuthResponse>> => {
    return apiRequest<AuthResponse>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Resend verification email
   */
  resendVerification: async (email: string): Promise<ApiResponse<{ retryAfter?: number }>> => {
    return apiRequest<{ retryAfter?: number }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<ApiResponse<{ session: AuthResponse['session'] }>> => {
    return apiRequest('/api/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  /**
   * Sign out current user
   */
  signout: async (accessToken: string): Promise<ApiResponse> => {
    return apiRequest('/api/auth/signout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },

  /**
   * Get current user
   */
  getUser: async (accessToken: string): Promise<ApiResponse<{ user: any; profile: any }>> => {
    return apiRequest('/api/auth/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
};
