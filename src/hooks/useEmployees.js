import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { logger } from '@/lib/logger';

export const useEmployees = () => {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      try {
        logger.info('Fetching employees...');
        const results = await base44.entities.Employee.where({}).find();
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
        const employee = await base44.entities.Employee.findById(id);
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
        const results = await base44.entities.Employee
          .where({ name: { $regex: searchTerm, $options: 'i' } })
          .find();
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