"use client";
import { useRouter } from "next/navigation";
import React from "react";

interface BackButtonProps { 
    children: React.ReactNode; 
    className?: string; 
}

export default function BackButton({ children, className }: BackButtonProps) {
  const router = useRouter();

  const handleback = () => {
    router.back();
  };
  return <span className={className} onClick={handleback}>{children}</span>;
}
