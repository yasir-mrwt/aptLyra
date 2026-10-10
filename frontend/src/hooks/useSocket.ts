import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { socketUpdateSession,getSessionById,reset,setSocketConnection } from "../features/session/sessionSlice";
import { useNavigate,useLocation } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import type { RootState,AppDispatch } from "../app/store";
import type { SocketUpdatePayload } from "../types/session";

const BACKEND_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace("/api", "");

const useSocket = () => {
    const navigate = useNavigate();
    const location=useLocation();
    const pathRef=useRef(location.pathname);
    const dispatch = useDispatch<AppDispatch>();
    const socketRef = useRef<Socket | null>(null);
    const user = useSelector((state: RootState) => state.auth.user);
    const isInitializing=useSelector((state:RootState)=>state.auth.isInitializing);
    const active=useSelector((state:RootState)=>state.session.activeSession);
    const activeRef=useRef(active);

    // Store dispatch and navigate in refs so they don't cause socket effect re-runs
    const dispatchRef = useRef(dispatch);
    const navigateRef = useRef(navigate);

    // Update refs in a separate effect (React 19 disallows ref updates during render)
    useEffect(() => {
        dispatchRef.current = dispatch;
        navigateRef.current = navigate;
        activeRef.current=active;
        pathRef.current=location.pathname;
    }, [dispatch, navigate,active,location.pathname]);

    const userId = user?._id || user?.id;

    useEffect(() => {
        if (!userId||isInitializing) return;
        if(activeRef.current && activeRef.current.user!==userId)dispatchRef.current(reset());

        // Don't create a new socket if one already exists for this user
        if (socketRef.current?.connected) return;

        const socket: Socket = io(BACKEND_URL, {
            query: { userId },
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;
        dispatchRef.current(setSocketConnection("connecting"));
        const seenEvents=new Set<string>();
        const refreshOwnedSession=()=>{
            const current=activeRef.current,route=pathRef.current.match(/^\/(?:interview|review)\/([^/]+)/)?.[1];
            if(current && current.user===userId && (!route || route===current._id))void dispatchRef.current(getSessionById(current._id));
        };

        socket.on('connect', () => {
            dispatchRef.current(setSocketConnection("connected"));
            console.log('Connected to socket');
            // Re-join the user's room on reconnection (crucial for Render cold starts)
            socket.emit('joinRoom', { userId });
            refreshOwnedSession();
        });

        socket.on('disconnect', (reason) => {
            dispatchRef.current(setSocketConnection("recovering"));
            console.log('Disconnected from socket:', reason);
        });
        socket.on('connect_error',()=>{dispatchRef.current(setSocketConnection("recovering"));});

        const handleTokenRefresh = () => {
            if (socket.disconnected) {
                console.log('Token refreshed, attempting to reconnect socket...');
                socket.connect();
            }
        };
        window.addEventListener('auth_token_refreshed', handleTokenRefresh);

        socket.on('sessionUpdate', (data: SocketUpdatePayload) => {
            if(data.revision!==undefined){
                if(!Number.isSafeInteger(data.revision) || !data.eventId || seenEvents.has(data.eventId))return;
                seenEvents.add(data.eventId);if(seenEvents.size>200)seenEvents.delete(seenEvents.values().next().value!);
                const current=activeRef.current;
                if(current?._id===data.sessionId && data.revision>(current.revision ?? -1))refreshOwnedSession();
                return;
            }
            const routeSession=pathRef.current.match(/^\/(?:interview|review)\/([^/]+)/)?.[1];
            if(routeSession && routeSession!==data.sessionId)return;
            // Planner confirmation owns new-session navigation. Historical events
            // may complete only the interview currently open in this tab.
            dispatchRef.current(socketUpdateSession(data));

            const status = (data.status || "").toUpperCase();
            if (status === "SESSION COMPLETED" && routeSession===data.sessionId) {
                navigateRef.current(`/review/${data.sessionId}`);

            }
        });

        return () => {
            window.removeEventListener('auth_token_refreshed', handleTokenRefresh);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [userId,isInitializing]);

    return socketRef;
};

export default useSocket;
