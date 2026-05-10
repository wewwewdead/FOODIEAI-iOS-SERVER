import React, { createContext, useContext, useState, useEffect } from 'react';
import supabase from './client/supabase';
import { ClipLoader } from "react-spinners";

const AuthContext = createContext(null);

export const AuthProvider = ({children}) =>{
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
        let mounted = true;

        const getInitialSession = async () =>{
            try {
                const {data: {session}} = await supabase.auth.getSession();
                if(mounted){
                    setSession(session)
                    setUser(session?.user || null)
                }
            } catch (error) {
                console.error("Error fetching initial session:", error);
            } finally {
                if(mounted){
                    setLoading(false)
                }
            }   
        }

        getInitialSession();
        //clean up subcription

         //listen for auth changes
        const {data: {subscription}} = supabase.auth.onAuthStateChange(
            (event, sessionData) =>{
                if(mounted){
                    setSession(sessionData);
                    setUser(sessionData?.user || null);
                    setLoading(false)//
                }
            }
        )

        return () =>{
            mounted = false
            subscription?.unsubscribe();
        }
    }, [])

    const value = {
        session,
        user,
        loading,
    }

    return(
        <AuthContext.Provider value={value}>
        {!loading ? children : <div><ClipLoader loading={loading} size={20} color="rgb(184 202 56)"/></div>}
        </AuthContext.Provider>
    )
}

export const useAuth = () =>{
    return useContext(AuthContext);
}
