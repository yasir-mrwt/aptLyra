import { useSelector } from "react-redux";
import { Outlet, Navigate } from "react-router-dom";
import type { RootState } from "../app/store";

const PublicRoute = () => {
    const { user, isLoading } = useSelector((state: RootState) => state.auth);
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-[80vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }
    
    // If user is already logged in, redirect to dashboard
    return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
};

export default PublicRoute;
