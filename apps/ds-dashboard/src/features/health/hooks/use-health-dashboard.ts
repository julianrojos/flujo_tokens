import { useHealthDashboardData } from '@/features/health/use-health-dashboard-data';

export function useHealthDashboard(systemId: string) {
  const { loading } = useHealthDashboardData(systemId);
  return { loading };
}
