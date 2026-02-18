import {
  useState,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authApi } from "@/services/api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    timezone: string,
    phoneNumber?: string,
  ) => Promise<{ error: Error | null; user: User | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Detect password recovery event from Supabase
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      }

      // Clear recovery flag after user updates password and signs in normally
      if (event === "SIGNED_IN" && isPasswordRecovery) {
        // Keep recovery true until the password is actually updated
      }

      if (event === "USER_UPDATED") {
        setIsPasswordRecovery(false);
      }

      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    timezone: string,
    phoneNumber?: string,
  ) => {
    try {
      // Call backend API for signup
      const response = await authApi.signup({
        email,
        password,
        fullName,
        timezone,
        phoneNumber,
      });

      if (!response.success || !response.data) {
        // Handle specific error types
        let errorMessage = response.error || "Failed to create account";
        
        if (errorMessage.includes("already exists") || errorMessage.includes("already registered")) {
          errorMessage = "An account with this email already exists";
        } else if (errorMessage.includes("rate limit")) {
          errorMessage = "Email rate limit exceeded. Please wait a few minutes before trying again.";
        } else if (errorMessage.includes("timeout") || errorMessage.includes("504") || errorMessage.includes("Gateway")) {
          errorMessage = "The server is taking too long to respond. Please try again in a moment.";
        }

        return {
          error: new Error(errorMessage),
          user: null,
        };
      }

      // Try to get user from Supabase to maintain compatibility
      // Note: The backend creates the user, but we may not have a session yet
      // So we'll return null for user and let the email verification flow handle it
      // The user will be available after email verification
      return { 
        error: null, 
        user: null, // User will be available after email verification
      };
    } catch (error: any) {
      // Handle network errors
      let errorMessage = error.message || "An unexpected error occurred during signup";
      
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        errorMessage = "Network error. Please check your internet connection and try again.";
      }

      return {
        error: new Error(errorMessage),
        user: null,
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Call backend API for signin
      const response = await authApi.signin({
        email,
        password,
      });

      if (!response.success || !response.data) {
        // Handle specific error types
        let errorMessage = response.error || "Failed to sign in";
        
        if (errorMessage.includes("Invalid email or password") || errorMessage.includes("Invalid login credentials")) {
          errorMessage = "Invalid email or password";
        } else if (errorMessage.includes("Email not confirmed") || errorMessage.includes("verify your email")) {
          errorMessage = "Please verify your email before signing in";
        } else if (errorMessage.includes("deactivated")) {
          errorMessage = "Your account has been deactivated. Please contact support to reactivate your account.";
        }

        return { error: new Error(errorMessage) };
      }

      // Set session in Supabase using the tokens from backend
      if (response.data.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });

        if (sessionError) {
          console.warn("Failed to set Supabase session:", sessionError);
          // Continue anyway - the backend authenticated successfully
        }
      }

      return { error: null };
    } catch (error: any) {
      // Handle network errors
      let errorMessage = error.message || "An unexpected error occurred during sign in";
      
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        errorMessage = "Network error. Please check your internet connection and try again.";
      }

      return { error: new Error(errorMessage) };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isPasswordRecovery, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Provide a more helpful error message
    console.error("useAuth must be used within an AuthProvider. Make sure AuthProvider wraps your component tree.");
    throw new Error("useAuth must be used within an AuthProvider. Please check that AuthProvider is wrapping your app.");
  }
  return context;
}