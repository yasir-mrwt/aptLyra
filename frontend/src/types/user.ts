interface User {
    id: string;
    _id?: string;
    name: string;
    email: string;
    avatar: string;
    /** Google profile photo URL (set when signed in / linked with Google). */
    avatarUrl?: string;
    /** Which identity provider backs this session: "google" | "email". */
    provider?: string;
    token: string;
    preferredRole?: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isError: boolean;
    message: string;
    isSuccess: boolean;
    isLoading: boolean;
    isProfileLoading: boolean;
    isAvatarUploading?: boolean;
    /** Set when registration is awaiting email OTP verification. */
    pendingVerificationEmail: string | null;
}

/** Response of POST /user/register when OTP verification is required. */
interface RegisterPendingResponse {
    requiresVerification: true;
    email: string;
    message: string;
}

export type { User, AuthState, RegisterPendingResponse };