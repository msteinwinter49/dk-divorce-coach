"use client";
import React, { createContext, useContext, useState } from "react";

const ErrorContext = createContext({ serverError: null, setServerError: () => {} });

export function ErrorProvider({ children }) {
  const [serverError, setServerError] = useState(null);
  return (
    <ErrorContext.Provider value={{ serverError, setServerError }}>
      {children}
    </ErrorContext.Provider>
  );
}

export const useError = () => useContext(ErrorContext);
