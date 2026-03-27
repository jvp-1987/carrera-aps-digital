import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { logger } from '@/lib/logger';

export const useEmployees = () => {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      try {
        logger.info('Fetching employees...');
        const results = await base44.entities.Employee.list('-created_date', 2000);
        logger.info(`Fetched ${results.length} employees`);
        return results;
      } catch (error) {
        logger.error('Failed to fetch employees', error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: 2,
  });
};

export const useEmployeeById = (id) => {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      try {
        logger.info(`Fetching employee ${id}...`);
        const employee = await base44.entities.Employee.filter({ id }).then(r => r[0]);
        logger.info(`Fetched employee: ${employee.id}`);
        return employee;
      } catch (error) {
        logger.error(`Failed to fetch employee ${id}`, error);
        throw error;
      }
    },
    enabled: !!id, // Solo hace query si hay ID
    staleTime: 1000 * 60 * 5,
  });
};

export const useEmployeesSearch = (searchTerm) => {
  return useQuery({
    queryKey: ['employees', 'search', searchTerm],
    queryFn: async () => {
      try {
        logger.info(`Searching employees: "${searchTerm}"`);
        // La búsqueda por regex/donde no parece estar soportada directamente como método .where()
        // Por ahora listamos todos y filtramos localmente para restaurar funcionalidad básica
        const all = await base44.entities.Employee.list(null, 2000);
        const results = all.filter(e => 
          e.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          e.rut?.includes(searchTerm)
        );
        logger.info(`Found ${results.length} employees`);
        return results;
      } catch (error) {
        logger.error(`Search failed for "${searchTerm}"`, error);
        throw error;
      }
    },
    enabled: !!searchTerm,
    staleTime: 1000 * 60 * 2,
  });
};