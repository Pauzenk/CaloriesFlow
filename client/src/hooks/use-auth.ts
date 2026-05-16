import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import type { AuthUser } from "@shared/schema";

export type { AuthUser };

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const login = useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return (await res.json()) as AuthUser;
    },
    onSuccess: (u) => {
      queryClient.setQueryData(["/api/auth/me"], u);
      queryClient.invalidateQueries();
    },
  });

  const register = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return (await res.json()) as AuthUser;
    },
    onSuccess: (u) => {
      queryClient.setQueryData(["/api/auth/me"], u);
      queryClient.invalidateQueries();
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });

  return { user: user ?? null, isLoading, login, register, logout };
}
