import { useTokenHealthQuery } from './use-health-queries';

export function useHealthDashboardData(systemId: string) {
  const tokenHealthQuery = useTokenHealthQuery(systemId);

  return {
    loading: tokenHealthQuery.isLoading,
  };
}
