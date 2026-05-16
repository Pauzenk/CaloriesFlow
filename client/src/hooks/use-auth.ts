import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

export type AuthUser = { id: string; username: string; name: string };

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const login = useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return (await res.json()) as AuthUser;
    },
    onSuccess: (u) => {
      queryClient.setQueryData(["/api/auth/me"], u);
      queryClient.invalidateQueries();
    },
  });

  const register = useMutation({
    mutationFn: async (data: { username: string; password: string; name: string }) => {
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
